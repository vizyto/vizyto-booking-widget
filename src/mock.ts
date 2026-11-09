// In-memory mock of the Vizyto public API, activated by data-vizyto-api="mock".
// Lets the whole booking + OTP + login flow be exercised locally before the
// backend endpoints ship. Test levers:
//   - OTP code is always 123456 (also printed to the console on send)
//   - email "taken@example.com" -> EMAIL_IN_USE (verify) / exists (checkEmail)
//   - login: taken@example.com + any non-empty password succeeds
//   - picking a slot at :55 -> createAppointment reports the slot is gone
//   - token "stale" -> BOOKED_BY_MISMATCH
//   - per-channel booking policy (#680), by business id:
//       680 -> the widget channel is switched off: the closed state, no steps
//       681 -> classes and the waitlist are off in the widget channel, visits,
//              rentals and tables stay open (the fork loses a branch, no
//              waitlist button)
//       682 -> the profile says open, but the owner switches the whole widget
//              channel off after the page loaded: every new-booking write
//              (a table and the table waitlist too) answers 409
//              CHANNEL_BOOKING_DISABLED (what the API sends for a closed
//              channel) and every later profile read says closed
//       683 -> the profile says open, but the owner switches actions off one
//              by one: each write answers 409 CHANNEL_ACTION_DISABLED and later
//              profile reads say that one action is closed (a table books
//              under `book`, like a visit, as on the API)
//   - tables: Mondays full (waitlist path), 20:00 a lost table (see below)
//   - loyalty (#471 F37), by business id; every other id has no program:
//       471 -> Points: balance 120, two tiers, three rewards on the card and two
//              catalog entries (one the balance pays for); the levers are listed
//              at the loyalty section below
//       472 -> a stamp card: 9 of 9 stamps, the stamp reward on the card and one
//              more catalog entry the stamps pay for
import type { TableDay, TableOptions, TablePeriod, TableSlot } from './tables'
import type {
  Business,
  CartItem,
  CartItemTime,
  CheckEmailResult,
  ClaimInput,
  ClaimResult,
  DayCounts,
  GroupClass,
  GroupSession,
  LoyaltyCatalogReward,
  LoyaltyProgramPublic,
  LoyaltyWallet,
  MyLoyaltyReward,
  RentalDaySlots,
  LoginResult,
  OtpSendResult,
  OtpVerifyResult,
  AppointmentQuoteRequest,
  PriceQuote,
  PriceQuoteLine,
  PromoBadges,
  PromoBadgesRequest,
  PromoPriceFields,
  PublicPromotionSummary,
  RentalQuoteRequest,
  RewardFields,
  RewardQuoteResult,
  RewardQuoteTarget,
  RewardSelection,
  ServiceCategory,
  Slots,
  WaitlistCheck,
  WaitlistCheckParams,
  WaitlistParams,
  WaitlistResult,
} from './api'
import type { CustomerAction } from './channel'
import { zonedIso } from './dates'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

const MOCK_BADGE = '-20%'
const isPromoDay = (date: string) => new Date(`${date.slice(0, 10)}T00:00:00Z`).getUTCDay() === 3
const isPromoTime = (time: string) => time.slice(0, 5) >= '12:00' && time.slice(0, 5) < '15:00'
const promoFields = (listPrice: number): PromoPriceFields => ({
  price: Math.round(listPrice * 0.8),
  listPrice,
  priorPrice: listPrice,
  advertised: true,
  badge: MOCK_BADGE,
})

const quoteOf = (lines: PriceQuoteLine[]): PriceQuote => {
  const total = lines.every((line) => line.price != null) ? lines.reduce((sum, line) => sum + (line.price ?? 0) * line.quantity, 0) : null
  const listTotal = lines.every((line) => line.listPrice != null) ? lines.reduce((sum, line) => sum + (line.listPrice ?? 0) * line.quantity, 0) : null
  const advertised = lines.some((line) => line.advertised)
  const priorTotal = advertised && lines.every((line) => line.price != null)
    ? lines.reduce((sum, line) => sum + (line.advertised ? (line.priorPrice ?? line.price ?? 0) : (line.price ?? 0)) * line.quantity, 0)
    : null
  return { lines, total, listTotal, priorTotal, advertised, badge: advertised ? MOCK_BADGE : null, assignedResourceId: null }
}

// Inline gradient thumbnail (data URI) so the service photo renders in mock mode
// without a network fetch. Real businesses serve gallery images over the CDN.
const THUMB =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='%23fd9320'/><stop offset='1' stop-color='%23bf700f'/></linearGradient></defs><rect width='120' height='120' fill='url(%23g)'/></svg>"

/** Druga i trzecia klatka galerii - żeby podgląd szczegółów miał czym przełączać. */
const swatch = (a: string, b: string) =>
  `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><defs><linearGradient id='g' x1='0' y1='1' x2='1' y2='0'><stop offset='0' stop-color='%23${a}'/><stop offset='1' stop-color='%23${b}'/></linearGradient></defs><rect width='120' height='120' fill='url(%23g)'/></svg>`
const THUMB2 = swatch('4b5563', '111827')
const THUMB3 = swatch('9ca3af', '4b5563')

const OPEN_ACTIONS: Record<CustomerAction, boolean> = {
  book: true, groupClasses: true, rentals: true, waitlist: true, reschedule: true, cancel: true,
}

/** Mock business ids that simulate the per-channel booking policy (#680). */
export const MOCK_CHANNEL_CLOSED = 680
export const MOCK_CHANNEL_PARTIAL = 681
export const MOCK_CHANNEL_CLOSES_ON_SUBMIT = 682
export const MOCK_ACTIONS_CLOSE_ON_SUBMIT = 683
/** Mock business ids with a loyalty program (#471 F37): Points, and a stamp card. */
export const MOCK_LOYALTY_POINTS = 471
export const MOCK_LOYALTY_STAMPS = 472
// Set by fetchBusiness: the write mocks below take no business id.
let mockBusinessId = 24
// What the owner has switched off since the page loaded (682: the whole channel,
// 683: these actions). Profile reads after a refusal reflect it, like the API.
let mockChannelSwitchedOff = false
const mockActionsSwitchedOff = new Set<CustomerAction>()

/**
 * 409 a write gets on business 682/683, with the code the API's policy service
 * (`channelRefusal`) picks: a channel switched off refuses every new booking with
 * CHANNEL_BOOKING_DISABLED, one action switched off in an open channel answers
 * CHANNEL_ACTION_DISABLED (a visit too).
 */
function channelRefusal(action: CustomerAction): { ok: false; code: string } | null {
  if (mockBusinessId === MOCK_CHANNEL_CLOSES_ON_SUBMIT) {
    mockChannelSwitchedOff = true
    return { ok: false, code: 'CHANNEL_BOOKING_DISABLED' }
  }
  if (mockBusinessId === MOCK_ACTIONS_CLOSE_ON_SUBMIT) {
    mockActionsSwitchedOff.add(action)
    return { ok: false, code: 'CHANNEL_ACTION_DISABLED' }
  }
  return null
}

const BUSINESS: Business = {
  id: 24,
  name: 'Proper Barbershop',
  slug: 'proper-barbershop',
  timezone: 'Europe/Warsaw',
  services: [
    // Variants (durationOptions >=2) + a gallery photo -> exercises the configure
    // sub-step (length picker) and the thumbnail. No overrides otherwise.
    {
      id: 1, name: 'Strzyżenie', description: '<p>Klasyczne strzyżenie nożyczkami i maszynką, z konsultacją.</p>', price: 6000, duration: 45,
      bookingType: 'single', fulfillmentMode: 'staff', providerSelection: 'customer',
      image: THUMB,
      images: [
        { id: 1, url: THUMB, orderIndex: 0 },
        { id: 2, url: THUMB2, orderIndex: 1 },
        { id: 3, url: THUMB3, orderIndex: 2 },
      ],
      durationOptions: [
        { label: 'Krótkie', durationMinutes: 30, priceCents: 5000 },
        { label: 'Klasyczne', durationMinutes: 45, priceCents: 6000 },
        { label: 'Z myciem', durationMinutes: 60, priceCents: 7500 },
      ],
    },
    // Add-on groups (a bounded group + loose add-ons) + per-worker "od" pricing.
    {
      id: 2, name: 'Broda', description: 'Modelowanie brody', price: 5000, duration: 30,
      bookingType: 'single', fulfillmentMode: 'staff', providerSelection: 'customer',
      resourceServices: [
        { id: 201, resourceId: 11, businessServiceId: 2, effectivePrice: 5000, effectiveDuration: 30, isActive: true },
        { id: 202, resourceId: 12, businessServiceId: 2, effectivePrice: 6000, effectiveDuration: 30, isActive: true },
        { id: 203, resourceId: 13, businessServiceId: 2, effectivePrice: 5000, effectiveDuration: 30, isActive: true },
      ],
      addonGroups: [
        {
          id: 10, name: 'Pielęgnacja', description: 'Wybierz maks. 2', minSelect: 0, maxSelect: 2,
          addons: [
            { id: 101, name: 'Woskowanie', description: 'Utrwalenie kształtu', price: 1500, extraDurationMinutes: 10 },
            { id: 102, name: 'Peeling twarzy', description: null, price: 2000, extraDurationMinutes: 15 },
            { id: 103, name: 'Olejek do brody', description: null, price: 1200, extraDurationMinutes: 0 },
          ],
        },
        // Loose add-ons land in pseudo-group id 0 (mirrors the API mapping).
        { id: 0, name: 'Dodatki', description: null, minSelect: 0, maxSelect: null, addons: [{ id: 104, name: 'Napój', description: null, price: 500, extraDurationMinutes: 0 }] },
      ],
    },
    // providerSelection 'auto' -> the specialist step is skipped even though two
    // workers offer it (server assigns). Kuba's price+duration overridden.
    {
      id: 3, name: 'Strzyżenie + broda', description: 'Pełny pakiet', price: 10000, duration: 75,
      bookingType: 'single', fulfillmentMode: 'staff', providerSelection: 'auto',
      resourceServices: [
        { id: 301, resourceId: 11, businessServiceId: 3, effectivePrice: 10000, effectiveDuration: 75, isActive: true },
        { id: 302, resourceId: 12, businessServiceId: 3, effectivePrice: 13000, effectiveDuration: 90, isActive: true },
      ],
    },
    // 'unit' service: no worker, the customer picks a station from the 'loza' pool
    // (or "Dowolny"). Exercises the unit-pick step. Also the "blocked" side of the
    // cancellation rule: this one cannot be cancelled online at all, so any cart
    // containing it says so (hours are then irrelevant, hence null).
    {
      id: 4, name: 'Loża VIP', description: 'Prywatna loża z obsługą', price: 12000, duration: 60,
      bookingType: 'single', fulfillmentMode: 'unit', providerSelection: 'customer', primaryObjectCategoryTag: 'loza',
      cancellationPolicy: { allowCancellation: false, cancellationHoursBefore: null, overridesBusinessPolicy: true },
    },
    // --- Services 5-8 exist so the offline harness can reach cases the first four
    // cannot: a DISJOINT pair (5 + 6 share no performer -> "nikt nie wykonuje
    // wszystkiego"), a second pool service (7, same 'loza' tag -> the object pick
    // must survive adding it), and enough rows to render the service search.
    {
      id: 5, name: 'Golenie brzytwą', description: 'Tylko u Marka', price: 8000, duration: 30,
      bookingType: 'single', fulfillmentMode: 'staff', providerSelection: 'customer',
      resourceServices: [{ id: 501, resourceId: 11, businessServiceId: 5, effectivePrice: 8000, effectiveDuration: 30, isActive: true }],
    },
    // Window-only override (48 h against the business 24 h): put it in a cart with
    // any other service and the identify step must still promise 48 h - MAX wins.
    // allowCancellation stays null: a service inherits the business "yes", it can
    // never grant one.
    {
      id: 6, name: 'Koloryzacja', description: 'Tylko u Oli', price: 15000, duration: 90,
      bookingType: 'single', fulfillmentMode: 'staff', providerSelection: 'customer',
      resourceServices: [{ id: 601, resourceId: 13, businessServiceId: 6, effectivePrice: 15000, effectiveDuration: 90, isActive: true }],
      cancellationPolicy: { allowCancellation: null, cancellationHoursBefore: 48, overridesBusinessPolicy: true },
    },
    {
      id: 7, name: 'Loża - przedłużenie', description: 'Dodatkowa godzina w loży', price: 9000, duration: 60,
      bookingType: 'single', fulfillmentMode: 'unit', providerSelection: 'customer', primaryObjectCategoryTag: 'loza',
    },
    {
      id: 8, name: 'Mycie i stylizacja', description: 'Krótka wizyta', price: 4000, duration: 20,
      bookingType: 'single', fulfillmentMode: 'staff', providerSelection: 'customer',
    },
    // Group classes are business_services rows with bookingType 'group' - the
    // 1:1 flow filters them out, the class flow resolves them by id. Two of them
    // so the class list is a real list, and the first one is free (a martial-arts
    // club selling an intro session for 0 zł is the case that produced the
    // "Bezpłatnie" label).
    {
      id: 31, name: 'Trening otwarty - pierwszy raz', description: '<p>Wejście próbne, bez zobowiązań. Strój sportowy wystarczy.</p>',
      price: 0, duration: 60,
      bookingType: 'group', fulfillmentMode: 'staff', providerSelection: 'auto',
      image: THUMB2,
      images: [{ id: 31, url: THUMB2, orderIndex: 0 }],
    },
    {
      id: 32, name: 'Grupa zaawansowana', description: 'Dla osób po co najmniej roku treningu', price: 5500, duration: 90,
      bookingType: 'group', fulfillmentMode: 'staff', providerSelection: 'auto',
    },
    {
      id: 34, name: 'Kurs semestralny', description: 'Zapis wyłącznie na okres', price: 5500, duration: 60,
      bookingType: 'group', fulfillmentMode: 'staff', providerSelection: 'auto',
    },
    {
      id: 33, name: 'Trening weekendowy', description: null, price: 5500, duration: 60,
      bookingType: 'group', fulfillmentMode: 'staff', providerSelection: 'auto',
    },
  ],
  resources: [
    { id: 11, type: 'worker', name: 'Marek', position: 'Barber', image: null, isBookable: true, isCustomerSelectable: true, categoryTag: null },
    { id: 12, type: 'worker', name: 'Kuba', position: 'Senior barber', image: null, isBookable: true, isCustomerSelectable: true, categoryTag: null },
    { id: 13, type: 'worker', name: 'Ola', position: 'Barberka', image: null, isBookable: true, isCustomerSelectable: true, categoryTag: null },
    // 'loza' pool for the unit service.
    { id: 21, type: 'object', name: 'Loża 1', position: null, image: null, isBookable: true, isCustomerSelectable: true, categoryTag: 'loza' },
    { id: 22, type: 'object', name: 'Loża 2', position: null, image: null, isBookable: true, isCustomerSelectable: true, categoryTag: 'loza' },
    // Rentables, covering BOTH time models. A pool of two hourly lanes grouped
    // into one card (exposure 'pool' -> the customer never picks lane 1 of 2),
    // and a single daily instance with tiers + deposit (range mode).
    {
      id: 28, type: 'object', name: 'Tor bowlingowy 1', position: null, image: null,
      isBookable: true, isCustomerSelectable: true, categoryTag: 'tor',
      isRentable: true, rentalUnit: 'hour', rentalMinUnits: 1, rentalMaxUnits: 4,
      rentalTypeId: 7, rentalTypeName: 'Tor', rentalUnitExposure: 'pool', rentalMaxPartySize: 6,
      rentalRate: 8000, pricingTiers: [], addons: [],
      publicAttributes: [{ key: 'lanes', label: 'Bandy', value: 'Tak', unit: null, type: 'boolean' }],
    },
    {
      id: 29, type: 'object', name: 'Tor bowlingowy 2', position: null, image: null,
      isBookable: true, isCustomerSelectable: true, categoryTag: 'tor',
      isRentable: true, rentalUnit: 'hour', rentalMinUnits: 1, rentalMaxUnits: 4,
      rentalTypeId: 7, rentalTypeName: 'Tor', rentalUnitExposure: 'pool', rentalMaxPartySize: 6,
      rentalRate: 8000, pricingTiers: [], addons: [],
    },
    {
      id: 31, type: 'object', name: 'Przyczepa Niewiadów N7', position: null, image: null,
      isBookable: true, isCustomerSelectable: true, categoryTag: 'przyczepa',
      isRentable: true, rentalUnit: 'day', rentalMinUnits: 1, rentalMaxUnits: 14,
      rentalTypeId: 8, rentalTypeName: 'Przyczepa', rentalUnitExposure: 'unit',
      rentalMaxPartySize: null, rentalDeposit: 50000,
      pricingTiers: [
        { minUnits: 1, maxUnits: 2, unitPrice: 12000, label: null },
        { minUnits: 3, maxUnits: null, unitPrice: 9000, label: 'od 3 dób taniej' },
      ],
      addons: [],
      publicAttributes: [
        { key: 'load', label: 'Ładowność', value: 750, unit: 'kg', type: 'number' },
        { key: 'brakes', label: 'Hamulce', value: 'Nie', unit: null, type: 'boolean' },
      ],
    },
  ],
  // Open every day 09:00-18:00: a daily rental starts at the opening time in the
  // business timezone, so an empty list would close every pickup day.
  hasWebsiteReservationsEnabled: true,
  // Everything open in every customer channel, as the API resolves it (#680).
  bookingChannels: {
    website: { enabled: true, actions: { ...OPEN_ACTIONS } },
    client_app: { enabled: true, actions: { ...OPEN_ACTIONS } },
    widget: { enabled: true, actions: { ...OPEN_ACTIONS } },
  },
  workingHours: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
    id: dayOfWeek + 1, dayOfWeek, openTime: '09:00', closeTime: '18:00', isOpened: true,
  })),
  // Demo levers: show the "rezerwacja próbna" notice and enable the waitlist so
  // both flows are reachable in the local configurator.
  isTestMode: true,
  waitlistEnabled: true,
  bookingPolicy: {
    allowCancellation: true,
    cancellationHoursBefore: 24,
    importantInfo: 'Prosimy o przyjście 5 minut przed wizytą.\nPłatność kartą lub gotówką na miejscu.',
  },
  // The tables pilot, so the fourth fork card ("Stolik") is reachable offline.
  capabilities: ['tables'],
  bookingSuspended: false,
}

export async function fetchBusiness(businessId?: number): Promise<Business> {
  await wait(280)
  mockBusinessId = businessId ?? BUSINESS.id
  if (businessId === MOCK_CHANNEL_CLOSED) {
    const closed = { book: false, groupClasses: false, rentals: false, waitlist: false, reschedule: true, cancel: true }
    return { ...BUSINESS, id: businessId, bookingChannels: { ...BUSINESS.bookingChannels, widget: { enabled: false, actions: closed } } }
  }
  if (businessId === MOCK_CHANNEL_PARTIAL) {
    const partial = { ...OPEN_ACTIONS, groupClasses: false, waitlist: false }
    return { ...BUSINESS, id: businessId, bookingChannels: { ...BUSINESS.bookingChannels, widget: { enabled: true, actions: partial } } }
  }
  if (businessId === MOCK_CHANNEL_CLOSES_ON_SUBMIT) {
    if (!mockChannelSwitchedOff) return { ...BUSINESS, id: businessId }
    const closed = { book: false, groupClasses: false, rentals: false, waitlist: false, reschedule: true, cancel: true }
    return { ...BUSINESS, id: businessId, bookingChannels: { ...BUSINESS.bookingChannels, widget: { enabled: false, actions: closed } } }
  }
  if (businessId === MOCK_ACTIONS_CLOSE_ON_SUBMIT) {
    const actions = { ...OPEN_ACTIONS }
    for (const a of mockActionsSwitchedOff) actions[a] = false
    return { ...BUSINESS, id: businessId, bookingChannels: { ...BUSINESS.bookingChannels, widget: { enabled: true, actions } } }
  }
  // The loyalty scenarios are the demo business under their own id.
  if (businessId === MOCK_LOYALTY_POINTS || businessId === MOCK_LOYALTY_STAMPS) return { ...BUSINESS, id: businessId }
  // Test lever: a single-family business (plain barbershop) must never see the
  // offering fork. Strips the group services and the rentables from the payload.
  // `typeof` guard: the mock also runs under bun:test, where there is no window.
  if (typeof window !== 'undefined' && (window as any).__VIZYTO_MOCK_ONLY_SERVICES__) {
    return {
      ...BUSINESS,
      services: BUSINESS.services.filter((x) => x.bookingType !== 'group'),
      resources: BUSINESS.resources.filter((r) => !(r as any).isRentable),
      capabilities: [],
    }
  }
  // Test lever: a business that rents one thing (7 = the pool of two lanes, 8 =
  // the trailer) next to its services and classes. It has no list step, so the
  // time step must open on that offer.
  const oneRental = typeof window !== 'undefined' ? Number((window as any).__VIZYTO_MOCK_ONE_RENTAL__) || null : null
  // Test levers: no services and no classes, so rentals and tables are what is
  // left (the fork then starts on the rental family); no tables pilot either, so
  // rentals are the only family.
  const noServices = typeof window !== 'undefined' && !!(window as any).__VIZYTO_MOCK_NO_SERVICES__
  const noTables = typeof window !== 'undefined' && !!(window as any).__VIZYTO_MOCK_NO_TABLES__
  if (oneRental != null || noServices || noTables) {
    return {
      ...BUSINESS,
      ...(noServices ? { services: [] } : {}),
      ...(noTables ? { capabilities: [] } : {}),
      resources: oneRental != null
        ? BUSINESS.resources.filter((r) => !(r as any).isRentable || (r as any).rentalTypeId === oneRental)
        : BUSINESS.resources,
    }
  }
  return BUSINESS
}

export async function getPromotionSummary(_bookedById?: number | null): Promise<PublicPromotionSummary> {
  await wait(120)
  return {
    maxSavePercent: 20,
    services: [{ businessServiceId: 1, saveUpToPercent: 20, priorPrice: 5000, priorPriceIsFrom: true }],
    addons: [{ addonId: 101, saveUpToPercent: 20, priorPrice: 1500 }],
    staff: [{
      resourceId: 11,
      businessServiceId: 1,
      variantMinutes: 30,
      texts: [{ amount: '20% taniej', headline: '20% taniej', rest: 'w środy od 12:00 do 15:00', note: null }],
      priorPrice: 5000,
    }],
    groupClasses: [{ groupClassId: 42, saveUpToPercent: 20, priorPrice: 5500 }],
    enrollmentOptions: [],
    rentals: [{ rentalTypeId: 7, resourceId: null, saveUpToPercent: 20, priorPrice: 8000, unitLabel: '/ godz.' }],
  }
}

export async function getPromoBadges(p: PromoBadgesRequest): Promise<PromoBadges> {
  if (p.target.kind === 'rental') record((j) => { j.rentalReads++ })
  await wait(100)
  const days: Record<string, string | null> = {}
  const slots: Record<string, string | null> = {}
  for (const date of p.dates) days[date] = isPromoDay(date) ? MOCK_BADGE : null
  if (p.slots && isPromoDay(p.slots.date)) {
    for (const time of p.slots.times) slots[time] = isPromoTime(time) ? MOCK_BADGE : null
  }
  // A mock price of the marked terms: 20% off 50 zł for the cart, 80 zł per rental unit.
  const marked = Object.values(days).some(Boolean) || Object.values(slots).some(Boolean)
  const units = p.target.kind === 'rental' ? p.target.units ?? 1 : 1
  const lowest = p.target.kind === 'rental' ? { total: 6400 * units, priorTotal: 8000 * units } : { total: 4000, priorTotal: 5000 }
  return { days, slots, lowest: marked ? lowest : null }
}

export async function quoteAppointment(p: AppointmentQuoteRequest): Promise<PriceQuote> {
  await wait(150)
  const promoted = isPromoDay(p.startDate) && isPromoTime(p.startDate.slice(11, 16))
  const lines: PriceQuoteLine[] = []
  for (const item of p.items) {
    const service = BUSINESS.services.find((s) => s.id === item.businessServiceId)
    if (!service) continue
    const variant = service.durationOptions?.find((o) => o.durationMinutes === item.durationMinutes)
    const listPrice = variant?.priceCents ?? service.price
    const promo = promoted && service.id === 1 ? promoFields(listPrice) : null
    lines.push({
      kind: 'service', name: service.name, quantity: 1, listPrice,
      price: promo?.price ?? listPrice, promotionId: promo ? 1 : null,
      priorPrice: promo?.priorPrice ?? null, advertised: promo?.advertised ?? false, badge: promo?.badge ?? null,
    })
    for (const addon of (service.addonGroups ?? []).flatMap((g) => g.addons).filter((a) => (item.addonIds ?? []).includes(a.id))) {
      const addonPromo = promoted && addon.id === 101 ? promoFields(addon.price) : null
      lines.push({
        kind: 'addon', name: addon.name, quantity: 1, listPrice: addon.price,
        price: addonPromo?.price ?? addon.price, promotionId: addonPromo ? 1 : null,
        priorPrice: addonPromo?.priorPrice ?? null, advertised: addonPromo?.advertised ?? false, badge: addonPromo?.badge ?? null,
      })
    }
  }
  return quoteOf(lines)
}

export async function quoteRental(p: RentalQuoteRequest): Promise<PriceQuote> {
  record((j) => { j.rentalReads++ })
  await wait(150)
  const resource = BUSINESS.resources.find((r) =>
    p.resourceId != null ? r.id === p.resourceId : r.rentalTypeId === p.rentalTypeId,
  )
  const unitMs = { minute: 60_000, hour: 3_600_000, day: 86_400_000, week: 7 * 86_400_000, month: 30 * 86_400_000 }[resource?.rentalUnit ?? 'hour']
  const units = Math.max(1, Math.round((new Date(p.endDate).getTime() - new Date(p.startDate).getTime()) / unitMs))
  const tier = (resource?.pricingTiers ?? []).find((x) => units >= x.minUnits && (x.maxUnits == null || units <= x.maxUnits))
  const listPrice = (tier?.unitPrice ?? resource?.rentalRate ?? 0) * units
  // A promotion that started after the reward was priced (the loyalty lever
  // below): quiet, not advertised, so only the reward conflict reveals it.
  if (latePromotionStarts.has(p.startDate)) {
    const late = promoFields(listPrice)
    return quoteOf([{
      kind: 'rental', name: resource?.rentalTypeName ?? resource?.name ?? 'Wynajem', quantity: 1, listPrice,
      price: late.price, promotionId: 2, priorPrice: null, advertised: false, badge: null,
    }])
  }
  const promoted = isPromoDay(p.startDate) && isPromoTime(p.startDate.slice(11, 16))
  const promo = promoted ? promoFields(listPrice) : null
  return quoteOf([{
    kind: 'rental', name: resource?.rentalTypeName ?? resource?.name ?? 'Wynajem', quantity: 1, listPrice,
    price: promo?.price ?? listPrice, promotionId: promo ? 1 : null,
    priorPrice: promo?.priorPrice ?? null, advertised: promo?.advertised ?? false, badge: promo?.badge ?? null,
  }])
}

export async function getServiceCategories(): Promise<ServiceCategory[]> {
  await wait(120)
  return [
    { id: 1, name: 'Włosy', serviceIds: [1, 6, 8] },
    { id: 2, name: 'Broda i pakiety', serviceIds: [2, 3, 5] },
  ]
}

// Mock windows never have free slots, so the whole waitlist flow stays reachable.
export async function checkWaitlistWindow(_p: WaitlistCheckParams): Promise<WaitlistCheck> {
  await wait(300)
  return { available: false, date: null, time: null, matchedSlots: 0 }
}

let waitlistCount = 0
export async function joinWaitlist(_p: WaitlistParams, _token: string | null): Promise<WaitlistResult> {
  await wait(500)
  const closed = channelRefusal('waitlist')
  if (closed) return closed
  // Second sign-up in a session simulates the "already waiting" duplicate error.
  waitlistCount += 1
  if (waitlistCount > 1) return { ok: false, code: 'WAITLIST_DUPLICATE' }
  return { ok: true, data: { id: 555, status: 'active' } }
}

// Sundays closed; every 4th day from today thinned to zero so "Brak terminów"
// states are reachable. Deterministic (date-driven), no randomness needed.
function dayIsOpen(ymd: string): boolean {
  const d = new Date(ymd + 'T00:00:00')
  if (d.getDay() === 0) return false
  const idx = Math.round((d.getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000)
  return idx % 4 !== 2
}

// Chain geometry for a mock cart: each position runs its variant length (or the
// service base) plus its add-ons, back to back. Without this the mock would make
// a 3-service cart look exactly like a single service and the cart would go
// untested in the offline flow.
function chainOf(items?: CartItem[]): { times: CartItemTime[]; total: number } {
  const times: CartItemTime[] = []
  let offset = 0
  for (const [i, it] of (items ?? []).entries()) {
    const svc = BUSINESS.services.find((s) => s.id === it.businessServiceId)
    const base = it.durationMinutes ?? svc?.duration ?? 30
    const extra = (svc?.addonGroups ?? [])
      .flatMap((g) => g.addons)
      .filter((a) => (it.addonIds ?? []).includes(a.id))
      .reduce((sum, a) => sum + (a.extraDurationMinutes || 0), 0)
    const durationMinutes = base + extra
    times.push({ itemIndex: i, startOffsetMinutes: offset, durationMinutes })
    offset += durationMinutes
  }
  return { times, total: offset }
}

export async function getCounts(p: { startDate: string; endDate: string; items?: CartItem[] }): Promise<DayCounts> {
  await wait(200)
  const out: DayCounts = {}
  const start = new Date(p.startDate + 'T00:00:00')
  const end = new Date(p.endDate + 'T00:00:00')
  // A longer chain fits fewer times into the same day - mirrors the real engine.
  const slotsPerDay = Math.max(1, 7 - Math.floor(chainOf(p.items).total / 45))
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const ymd = d.toISOString().slice(0, 10)
    out[ymd] = dayIsOpen(ymd) ? slotsPerDay : 0
  }
  return out
}

export async function getAvailability(
  p: { date: string; items?: CartItem[] },
): Promise<{ slots: Slots; itemTimes: CartItemTime[]; totalMinutes: number; slotCandidates?: Record<string, number[][]> }> {
  await wait(320)
  const { times, total } = chainOf(p.items)
  if (!dayIsOpen(p.date)) return { slots: [], itemTimes: times, totalMinutes: total }
  const slots: Slots = []
  // UTC keys 08:00..13:30 render ~10:00..15:30 in Europe/Warsaw (summer). A chain
  // longer than an hour eats into the tail of the day, jak w silniku.
  const lastHour = total > 60 ? 12 : 13
  for (let h = 8; h <= lastHour; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`, `${String(h).padStart(2, '0')}:30`)
  }
  slots.push('13:55') // sentinel: picking this triggers a "slot gone" on book
  // Per-slot candidates for the specialist picker: the mock's workers 11/12/13,
  // thinned by hour so the list is not always identical.
  const workerIds = BUSINESS.resources.filter((r) => r.type === 'worker').map((r) => r.id)
  const slotCandidates: Record<string, number[][]> = {}
  for (const s of slots) {
    const h = Number(s.slice(0, 2))
    const free = workerIds.filter((_, i) => (h + i) % 3 !== 0)
    slotCandidates[s] = (p.items ?? [{}]).map(() => (free.length ? free : workerIds))
  }
  return { slots, itemTimes: times, totalMinutes: total, slotCandidates }
}

// First open day at/after `from` with a slot - drives "najbliższy wolny termin".
export async function getFirstFree(p: { from?: string }): Promise<{ date: string; time: string } | null> {
  await wait(400)
  const start = p.from ? new Date(p.from + 'T00:00:00') : new Date()
  for (let i = 0; i < 60; i++) {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    const ymd = d.toISOString().slice(0, 10)
    if (dayIsOpen(ymd)) return { date: ymd, time: '08:00' }
  }
  return null
}

let lastOtpAt = 0
let attempts = 0

// Mock existing-account phone: any number ending in 777 behaves like a phone
// already attached to a Vizyto account (OTP doubles as a login).
const isExistingAccountPhone = (phone: string) => phone.replace(/\D/g, '').endsWith('777')

export async function sendGuestOtp(p: { phone: string }): Promise<OtpSendResult> {
  await wait(450)
  const since = (Date.now() - lastOtpAt) / 1000
  if (lastOtpAt && since < 60) return { ok: false, code: 'RATE_LIMITED', retryAfter: Math.ceil(60 - since) }
  lastOtpAt = Date.now()
  attempts = 0
  // eslint-disable-next-line no-console
  console.info('%c[vizyto mock] OTP = 123456', 'color:#fd9320;font-weight:bold')
  return { ok: true, expiresIn: 300, maskedPhone: p.phone.replace(/\d(?=\d{3})/g, '*'), mode: isExistingAccountPhone(p.phone) ? 'login' : 'guest', codeLength: 6 }
}

export async function verifyGuestOtp(p: {
  firstName: string
  lastName: string
  email: string
  phone: string
  otp: string
}): Promise<OtpVerifyResult> {
  await wait(500)
  if (p.otp === '123456' && isExistingAccountPhone(p.phone)) {
    lastOtpAt = 0
    return { ok: true, data: { userId: 555, token: 'mock-token' }, mode: 'login' }
  }
  if (p.email.trim().toLowerCase() === 'taken@example.com') return { ok: false, code: 'EMAIL_IN_USE' }
  if (p.otp === '123456') {
    lastOtpAt = 0
    return { ok: true, data: { userId: 999, token: 'mock-token' }, mode: 'guest' }
  }
  attempts += 1
  const remaining = Math.max(0, 3 - attempts)
  if (remaining === 0) return { ok: false, code: 'INVALID', remainingAttempts: 0 }
  return { ok: false, code: 'INVALID', remainingAttempts: remaining }
}

export async function checkEmail(email: string): Promise<CheckEmailResult> {
  await wait(180)
  return { exists: email.trim().toLowerCase() === 'taken@example.com', providers: ['credential'] }
}

export async function loginEmail(p: { email: string; password: string }): Promise<LoginResult> {
  await wait(500)
  if (p.email.trim().toLowerCase() === 'taken@example.com' && p.password.length > 0)
    return { ok: true, data: { userId: 777, token: 'mock-token' } }
  return { ok: false, code: 'INVALID_CREDENTIALS' }
}

export async function oauthLogin(provider: string): Promise<LoginResult> {
  await wait(800)
  // eslint-disable-next-line no-console
  console.info(`%c[vizyto mock] OAuth ${provider} → zalogowano`, 'color:#fd9320;font-weight:bold')
  return { ok: true, data: { userId: 888, token: 'mock-token' } }
}

/** A refused mock write, with the reward fields the API adds to some refusals. */
type MockFailure = { ok: false; code: string; message?: string; lineIndexes?: number[]; pricing?: PriceQuote }
type MockWrite = { ok: true; data: any } | MockFailure

/**
 * What the widget asked the mock, for scripts/step-smoke.mjs: the GET /loyalty
 * reads (a visitor who only looks makes none), the rental reads (counts, day
 * slots, rental promotion badges, range checks, quotes: the offering fork makes
 * none) and what the last create carried (no reward without a program). On
 * window as `__VIZYTO_MOCK_JOURNAL__` from the first answer it records, so a page
 * on the real API never gets the global.
 */
type MockJournal = {
  loyaltyReads: number
  rentalReads: number
  lastCreate: { flow: 'appointment' | 'rental' | 'class'; input: Record<string, unknown> } | null
}
const journal: MockJournal = { loyaltyReads: 0, rentalReads: 0, lastCreate: null }
function record(change: (j: MockJournal) => void) {
  change(journal)
  if (typeof window !== 'undefined') (window as any).__VIZYTO_MOCK_JOURNAL__ = journal
}

export async function createAppointment(
  p: { items?: CartItem[]; startDate: string; expectedTotal?: number | null; reward?: RewardFields | null },
  token: string | null,
): Promise<MockWrite> {
  record((j) => { j.lastCreate = { flow: 'appointment', input: { ...p } } })
  await wait(600)
  if (token === 'stale') return { ok: false, code: 'BOOKED_BY_MISMATCH' }
  const closed = channelRefusal('book')
  if (closed) return closed
  if (/T\d{2}:55/.test(p.startDate)) return { ok: false, code: 'SLOT_TAKEN' }
  const refused = await rewardCreateRefusal({ flow: 'appointment', payload: { items: p.items ?? [], startDate: p.startDate } }, p.reward)
  if (refused) return refused
  return { ok: true, data: { id: 12345, status: 'confirmed' } }
}

// ---- group classes -------------------------------------------------------
// Wrapper rows. The 'fixed' one must never reach the picker: its roster comes
// from linked customer groups and the server refuses self sign-up.
const GROUP_CLASSES: GroupClass[] = [
  // Available via period enrollment, but never bookable as a single entry.
  { id: 45, businessServiceId: 34, entryEnabled: false, availability: 'available', capacity: 12, spotsLeft: null, attendanceMode: 'open', cancellationCutoffHours: null },
  { id: 41, entryEnabled: true, businessServiceId: 31, availability: 'available', capacity: 12, spotsLeft: 9, attendanceMode: 'open', cancellationCutoffHours: 12 },
  { id: 42, entryEnabled: true, businessServiceId: 32, availability: 'last_spots', capacity: 8, spotsLeft: 2, attendanceMode: 'open', cancellationCutoffHours: null },
  { id: 44, entryEnabled: true, businessServiceId: 33, availability: 'full', capacity: 8, spotsLeft: 0, attendanceMode: 'open', cancellationCutoffHours: null },
  { id: 43, entryEnabled: true, businessServiceId: 32, availability: 'full', capacity: 6, spotsLeft: 0, attendanceMode: 'fixed', cancellationCutoffHours: null },
]

export async function fetchGroupClasses(): Promise<GroupClass[]> {
  await wait(200)
  return GROUP_CLASSES
}

/**
 * Materialized terms across the next few days, business-local. Deliberately
 * includes a FULL term (0 seats left) and one with a single seat, so the seat
 * badges and the disabled state are both reachable without a backend.
 */
export async function fetchTimetable(): Promise<GroupSession[]> {
  await wait(300)
  return timetableRows()
}

function timetableRows(): GroupSession[] {
  const day = (offset: number) => {
    const d = new Date()
    d.setDate(d.getDate() + offset)
    return d.toISOString().slice(0, 10)
  }
  const at = (offset: number, hhmm: string) => `${day(offset)}T${hhmm}:00.000Z`
  const todayDow = new Date().getDay()
  const nextWednesday = ((3 - todayDow + 7) % 7) || 7
  return [
    { id: 921, availability: 'available', groupClassId: 45, startDate: at(1, '14:00'), endDate: at(1, '15:00'), dateLocal: day(1), status: 'scheduled', priceOverride: null },
    { id: 901, availability: 'available', groupClassId: 41, startDate: at(1, '16:00'), endDate: at(1, '17:00'), dateLocal: day(1), status: 'scheduled', priceOverride: null, promo: isPromoDay(day(1)) ? promoFields(5000) : null, instructor: { id: 11, name: 'Marek', image: null } },
    { id: 902, availability: 'last_spots', groupClassId: 41, startDate: at(2, '14:00'), endDate: at(2, '15:00'), dateLocal: day(2), status: 'scheduled', priceOverride: null, promo: isPromoDay(day(2)) ? promoFields(5000) : null, instructor: { id: 11, name: 'Marek', image: null } },
    { id: 903, availability: 'full', groupClassId: 41, startDate: at(3, '16:00'), endDate: at(3, '17:00'), dateLocal: day(3), status: 'scheduled', priceOverride: null, instructor: { id: 13, name: 'Ola', image: null } },
    { id: 911, availability: 'last_spots', groupClassId: 42, startDate: at(1, '18:30'), endDate: at(1, '20:00'), dateLocal: day(1), status: 'scheduled', priceOverride: null, instructor: { id: 12, name: 'Kuba', image: null } },
    { id: 912, availability: 'available', groupClassId: 42, startDate: at(4, '18:30'), endDate: at(4, '20:00'), dateLocal: day(4), status: 'scheduled', priceOverride: 4000, instructor: { id: 12, name: 'Kuba', image: null } },
    { id: 913, availability: 'available', groupClassId: 42, startDate: at(nextWednesday, '14:00'), endDate: at(nextWednesday, '15:30'), dateLocal: day(nextWednesday), status: 'scheduled', priceOverride: null, promo: promoFields(5500), instructor: { id: 12, name: 'Kuba', image: null } },
  ]
}

/** Session 903 is full in the timetable above - reject it the way the server does. */
export async function registerForSession(
  p: { sessionId: number; expectedTotal?: number | null; reward?: RewardFields | null },
  token: string | null,
): Promise<MockWrite> {
  record((j) => { j.lastCreate = { flow: 'class', input: { ...p } } })
  await wait(600)
  if (token === 'stale') return { ok: false, code: 'BOOKED_BY_MISMATCH' }
  const closed = channelRefusal('groupClasses')
  if (closed) return closed
  if (p.sessionId === 921) return { ok: false, code: 'ENTRY_DISABLED' }
  if (p.sessionId === 903) return { ok: false, code: 'SESSION_FULL' }
  const refused = await rewardCreateRefusal({ flow: 'class', sessionId: p.sessionId }, p.reward)
  if (refused) return refused
  return { ok: true, data: { id: 5150, sessionId: p.sessionId, status: 'registered' } }
}

// ---- rentals -------------------------------------------------------------
// The mock business rents two things, on purpose covering BOTH time models:
//  - "Tor bowlingowy" - hourly pool of 2 lanes (slot mode, party size)
//  - "Przyczepa" - daily single instance with pricing tiers (range mode, deposit)

const day = (offset: number) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}

export async function getRentalCounts(p: { from: string; to: string }): Promise<DayCounts> {
  record((j) => { j.rentalReads++ })
  await wait(200)
  const out: DayCounts = {}
  for (let i = 0; i < 21; i++) {
    const d = day(i)
    if (d < p.from || d > p.to) continue
    // Every third day closed, so the calendar has both states to render.
    out[d] = i % 3 === 2 ? 0 : 6
  }
  return out
}

export async function getRentalDaySlots(p: { resourceId?: number; rentalTypeId?: number; date: string }): Promise<RentalDaySlots> {
  record((j) => { j.rentalReads++ })
  await wait(250)
  // The trailer (resource 31) is billed per day -> no grid at all.
  if (p.resourceId === 31) return { mode: 'range' }
  // Like the API: `local` is the wall clock of the business timezone, `start` the
  // real instant (10:00 in Warsaw is 08:00Z in summer). Keeping them different is
  // what lets the smoke catch a widget that glues `local` to "Z" again.
  const slots = ['10:00', '11:00', '12:00', '14:00', '15:00', '18:00'].map((hh) => ({
    start: zonedIso(p.date, hh, BUSINESS.timezone || 'Europe/Warsaw') ?? `${p.date}T${hh}:00.000Z`,
    local: hh,
    resourceIds: [21, 22],
    promo: isPromoDay(p.date) && isPromoTime(hh) ? promoFields(8000) : null,
  }))
  return { mode: 'slots', unit: 'hour', minUnits: 1, stepMinutes: 60, durationMinutes: 60, slots }
}

/** Deliberately refuses a window that starts on the third day (a closed day). */
export async function checkRentalRange(p: { startDate: string }): Promise<boolean> {
  record((j) => { j.rentalReads++ })
  await wait(250)
  return !p.startDate.startsWith(day(2))
}

export async function createRental(
  p: { resourceId?: number; rentalTypeId?: number; startDate: string; endDate?: string; expectedTotal?: number | null; reward?: RewardFields | null },
  token: string | null,
): Promise<MockWrite> {
  record((j) => { j.lastCreate = { flow: 'rental', input: { ...p } } })
  await wait(600)
  if (token === 'stale') return { ok: false, code: 'BOOKED_BY_MISMATCH' }
  const closed = channelRefusal('rentals')
  if (closed) return closed
  if (/T\d{2}:55/.test(p.startDate)) return { ok: false, code: 'RENTAL_SLOT_UNAVAILABLE' }
  if (p.endDate) {
    const payload = { resourceId: p.resourceId ?? null, rentalTypeId: p.rentalTypeId ?? null, startDate: p.startDate, endDate: p.endDate }
    const refused = await rewardCreateRefusal({ flow: 'rental', payload }, p.reward)
    if (refused) return refused
  }
  return { ok: true, data: { id: 7700, status: 'reserved' } }
}

// ---- restaurant tables (vizyto #903 F11) -----------------------------------
// Levers:
//  - Mondays are full (counts 0, every start taken): the empty day with
//    "Powiadom mnie" and the table waitlist can be clicked through,
//  - a party above 6 finds 19:00 and 19:30 grey ("Szare godziny"),
//  - 20:00 answers TABLE_NOT_AVAILABLE with the API message (a lost table).

const isMonday = (date: string) => new Date(`${date}T00:00:00`).getDay() === 1

/** `2026-11-02T19:00:00+01:00`: the venue's wall time with the visitor's offset. */
const localIso = (date: string, time: string) => {
  const d = new Date(`${date}T${time}:00`)
  const off = -d.getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  const abs = Math.abs(off)
  return `${date}T${time}:00${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
}

const halfHours = (from: string, to: string) => {
  const out: string[] = []
  const [fh, fm] = from.split(':').map(Number)
  const [th, tm] = to.split(':').map(Number)
  for (let m = fh! * 60 + fm!; m <= th! * 60 + tm!; m += 30) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)
  }
  return out
}

export async function getTableOptions(): Promise<TableOptions> {
  await wait(160)
  return {
    zones: [{ id: 1, name: 'Sala główna' }, { id: 2, name: 'Ogródek' }],
    confirmationMode: 'auto',
    assignmentMode: 'auto',
    lateAfterMinutes: 15,
    maxAdults: 10,
    maxChildren: 4,
  }
}

export async function getTableCounts(p: { from: string; to: string }): Promise<DayCounts> {
  await wait(200)
  const out: DayCounts = {}
  const d = new Date(`${p.from}T00:00:00`)
  for (;;) {
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (ymd > p.to) break
    out[ymd] = isMonday(ymd) ? 0 : 14
    d.setDate(d.getDate() + 1)
  }
  return out
}

export async function getTableDay(p: { date: string; guests: number }): Promise<TableDay> {
  await wait(240)
  const now = Date.now()
  const period = (periodId: number, name: string, from: string, lastSeating: string): TablePeriod => ({
    periodId,
    name,
    lastSeating,
    slots: halfHours(from, lastSeating).map((time) => {
      const startAt = localIso(p.date, time)
      const reason: TableSlot['reason'] = new Date(startAt).getTime() <= now
        ? 'past'
        : isMonday(p.date) || (p.guests > 6 && time >= '19:00' && time < '20:00')
          ? 'taken'
          : undefined
      return { startAt, time, available: !reason, ...(reason ? { reason } : {}) }
    }),
  })
  return {
    date: p.date,
    guests: p.guests,
    durationMinutes: p.guests > 4 ? 120 : 90,
    periods: [period(1, 'Lunch', '12:00', '14:30'), period(2, 'Kolacja', '17:00', '21:00')],
  }
}

export async function createTableReservation(
  p: { startAt: string },
  token: string | null,
): Promise<{ ok: true; data: any } | { ok: false; code: string; message?: string }> {
  await wait(600)
  if (token === 'stale') return { ok: false, code: 'BOOKED_BY_MISMATCH' }
  // A table is created as a visit on the API, so it books under the `book` action.
  const closed = channelRefusal('book')
  if (closed) return closed
  if (p.startAt.includes('T20:00')) {
    return { ok: false, code: 'TABLE_NOT_AVAILABLE', message: 'Brak wolnego stolika dla tej liczby osób o tej godzinie. Wybierz inną godzinę.' }
  }
  return { ok: true, data: { id: 9300, status: 'confirmed' } }
}

export async function joinTableWaitlist(
  _p: { dateFrom: string },
  token: string | null,
): Promise<{ ok: true; data: any } | { ok: false; code: string }> {
  await wait(400)
  if (token === 'stale') return { ok: false, code: 'BOOKED_BY_MISMATCH' }
  const closed = channelRefusal('waitlist')
  if (closed) return closed
  return { ok: true, data: { id: 8800 } }
}

// ---- loyalty (vizyto #471 F37) ---------------------------------------------
// Two programs on the demo business, by id (every other id has none, so the
// default demo and the tests make no loyalty request of consequence):
//  - 471, Points: balance 120, tiers Srebrny (from 0) and Złoty (from 200), three
//    rewards on the card and two catalog entries:
//      "Rabat 20 zł"         amount, every position, does not stack,
//      "Darmowe strzyżenie"  free item, any length of service 1,
//      "Rabat 15 zł"         stacks, but a parallel booking takes it: the create
//                            answers REWARD_UNAVAILABLE (recovery path),
//      catalog "Rabat 10%"   100 Points: the balance pays for it,
//      catalog "Rabat 25%"   500 Points: it does not.
//    Levers:
//      add-on "Peeling twarzy" -> a reward that does not stack is refused on it at
//                                 quote (409 REWARD_DISCOUNT_CONFLICT with its line):
//                                 the widget prices the reward again without it,
//      a lane rented at 18:00  -> a create with a reward that does not stack answers
//                                 409 REWARD_DISCOUNT_CONFLICT: a quiet promotion
//                                 started meanwhile (later quotes show it),
//      class term 912          -> the first create with a reward answers
//                                 REWARD_QUOTE_EXPIRED with the same total (the
//                                 widget retries silently with the fresh token).
//  - 472, stamps: 9 of 9, the stamp reward ("Darmowe strzyżenie") on the card and
//    a catalog "Rabat 10 zł" for 5 stamps.
//  Harness levers for both (window globals, set from the harness address):
//      __VIZYTO_MOCK_FAIL_REWARD_QUOTE__ = <reward id> -> the first quote of that
//                                 reward fails (NETWORK): "Spróbuj ponownie",
//      __VIZYTO_MOCK_CLAIM_REFUSAL__ = <code> -> the first claim answers that code,
//      __VIZYTO_MOCK_SLOW_LOYALTY__ = 'program' | 'card' | 'entry' | 'price' -> every
//                                 read of that kind (the program; the card, its
//                                 rewards and the catalog; a class entry's price;
//                                 a reward price) answers after MOCK_SLOW_LOYALTY_MS,
//                                 longer than the booking waits for it,
//      __VIZYTO_MOCK_BROKEN_LOYALTY__ = 'entry' | 'reward' -> a class entry's price
//                                 carries a line the reward step cannot read, or
//                                 the card lists a reward without its terms.
// A reward quote answers pricingToken `mock-reward-<id>`; a create with a reward
// moves it to `reserved`; a claim lowers the balance and adds the reward.

const LOYALTY_TERMS = [
  'Regulamin programu lojalnościowego',
  '',
  '1. Punkty przyznaje obsługa po rozliczeniu wizyty.',
  '2. Punkty i nagrody wykorzystasz tylko w tym miejscu.',
  '3. Odebraną nagrodę wybierzesz przy rezerwacji online albo pokażesz na miejscu.',
].join('\n')

const TIERS = [
  { id: 1, name: 'Srebrny', threshold: 0, bonusPercent: null, stacksWithPromotions: false },
  { id: 2, name: 'Złoty', threshold: 200, bonusPercent: 5, stacksWithPromotions: false },
]

const POINTS_PROGRAM: LoyaltyProgramPublic = {
  id: 4710,
  status: 'active',
  earningEnabled: true,
  welcomePoints: 20,
  pointsExpiryMonths: 12,
  termsText: LOYALTY_TERMS,
  termsVersion: 2,
  card: { displayMode: 'points' },
  tiers: TIERS,
  earnRules: [
    { id: 1, kind: 'amount', points: 1, amountUnitGrosze: 1000, minimumTotalGrosze: null, includePassVisits: false, includeFreeRewardVisits: false },
    { id: 2, kind: 'online_booking', points: 5, amountUnitGrosze: null, minimumTotalGrosze: null, includePassVisits: false, includeFreeRewardVisits: false },
  ],
  stampReward: null,
}

const STAMP_PROGRAM: LoyaltyProgramPublic = {
  id: 4720,
  status: 'active',
  earningEnabled: true,
  welcomePoints: null,
  pointsExpiryMonths: null,
  termsText: LOYALTY_TERMS,
  termsVersion: 1,
  card: { displayMode: 'stamps' },
  tiers: [],
  earnRules: [
    { id: 3, kind: 'visit', points: 1, amountUnitGrosze: null, minimumTotalGrosze: null, includePassVisits: false, includeFreeRewardVisits: false },
  ],
  stampReward: { catalogId: 47201, stampCount: 9 },
}

/** Every length of service 1 ("Strzyżenie"): what the API keys a variant line with. */
const HAIRCUT_TARGETS = [30, 45, 60].map((minutes, i) => ({
  id: 900 + i, kind: 'service_variant' as const, businessServiceId: 1, variantMinutes: minutes, targetKey: `service_variant:1:${minutes}`,
}))

const catalogEntry = (patch: Partial<LoyaltyCatalogReward> & Pick<LoyaltyCatalogReward, 'id' | 'name' | 'kind' | 'value' | 'pointsCostMin'>): LoyaltyCatalogReward => ({
  pointsCostMax: patch.pointsCostMin,
  pointsCostStep: 1,
  valueAtMin: patch.value,
  valuePerStep: 0,
  minimumTotalGrosze: null,
  stacksWithPromotions: false,
  onSiteOnly: false,
  validityDays: 90,
  scope: 'all',
  targets: [],
  ...patch,
})

const CATALOGS: Record<number, LoyaltyCatalogReward[]> = {
  [MOCK_LOYALTY_POINTS]: [
    catalogEntry({ id: 47104, name: 'Rabat 10%', kind: 'percent', value: 10, pointsCostMin: 100, stacksWithPromotions: true }),
    catalogEntry({ id: 47105, name: 'Rabat 25%', kind: 'percent', value: 25, pointsCostMin: 500 }),
  ],
  [MOCK_LOYALTY_STAMPS]: [
    catalogEntry({ id: 47201, name: 'Darmowe strzyżenie', kind: 'free_item', value: 0, pointsCostMin: 9, scope: 'selected', targets: HAIRCUT_TARGETS, validityDays: 60 }),
    catalogEntry({ id: 47202, name: 'Rabat 10 zł', kind: 'amount', value: 1000, pointsCostMin: 5 }),
  ],
}

const ownedReward = (id: number, catalogId: number, terms: Partial<MyLoyaltyReward['termsSnapshot']> & Pick<MyLoyaltyReward['termsSnapshot'], 'name' | 'kind' | 'resolvedValue'>): MyLoyaltyReward => ({
  id,
  catalogId,
  status: 'available',
  expiresAt: null,
  termsSnapshot: { scope: 'all', targets: [], selectedTargetKey: null, minimumTotalGrosze: null, onSiteOnly: false, stacksWithPromotions: false, ...terms },
})

/** The reward "used in another booking" between the quote and the create. */
const MOCK_REWARD_TAKEN_ELSEWHERE = 4703
/** The class term whose first create with a reward finds its token expired. */
const MOCK_TOKEN_EXPIRES_SESSION = 912

type MockCard = { balance: number; owned: MyLoyaltyReward[]; claims: Map<string, number>; nextId: number }
const loyaltyCards = new Map<number, MockCard>()
/** Rental starts where a quiet promotion began after the reward was priced. */
const latePromotionStarts = new Set<string>()
const expiredTokens = new Set<string>()

function cardOf(businessId: number): MockCard | null {
  if (businessId !== MOCK_LOYALTY_POINTS && businessId !== MOCK_LOYALTY_STAMPS) return null
  let card = loyaltyCards.get(businessId)
  if (!card) {
    card = businessId === MOCK_LOYALTY_POINTS
      ? {
          balance: 120,
          owned: [
            ownedReward(4701, 47101, { name: 'Rabat 20 zł', kind: 'amount', resolvedValue: 2000 }),
            ownedReward(4702, 47102, { name: 'Darmowe strzyżenie', kind: 'free_item', resolvedValue: 0, scope: 'selected', targets: HAIRCUT_TARGETS }),
            ownedReward(MOCK_REWARD_TAKEN_ELSEWHERE, 47103, { name: 'Rabat 15 zł', kind: 'amount', resolvedValue: 1500, stacksWithPromotions: true }),
          ],
          claims: new Map(),
          nextId: 4710,
        }
      : {
          balance: 9,
          owned: [ownedReward(4721, 47201, { name: 'Darmowe strzyżenie', kind: 'free_item', resolvedValue: 0, scope: 'selected', targets: HAIRCUT_TARGETS })],
          claims: new Map(),
          nextId: 4730,
        }
    loyaltyCards.set(businessId, card)
  }
  return card
}

const programOf = (businessId: number) =>
  businessId === MOCK_LOYALTY_POINTS ? POINTS_PROGRAM : businessId === MOCK_LOYALTY_STAMPS ? STAMP_PROGRAM : null

/** How late a read of the slow kind answers: past every wait of the booking (src/loyalty.ts). */
export const MOCK_SLOW_LOYALTY_MS = 6000
type SlowLoyaltyRead = 'program' | 'card' | 'entry' | 'price'
/** The harness lever above. `typeof` guard: the mock also runs under bun:test. */
const slowLoyalty = (kind: SlowLoyaltyRead) =>
  typeof window !== 'undefined' && (window as any).__VIZYTO_MOCK_SLOW_LOYALTY__ === kind ? wait(MOCK_SLOW_LOYALTY_MS) : Promise.resolve()
const brokenLoyalty = (kind: 'entry' | 'reward') =>
  typeof window !== 'undefined' && (window as any).__VIZYTO_MOCK_BROKEN_LOYALTY__ === kind

export async function getLoyaltyProgram(businessId: number): Promise<LoyaltyProgramPublic | null> {
  record((j) => { j.loyaltyReads++ })
  await wait(120)
  await slowLoyalty('program')
  return programOf(businessId)
}

export async function getLoyaltyCatalog(businessId: number): Promise<LoyaltyCatalogReward[]> {
  await wait(120)
  await slowLoyalty('card')
  return CATALOGS[businessId] ?? []
}

export async function getMyLoyalty(businessId: number, _token: string): Promise<LoyaltyWallet | null> {
  await wait(160)
  await slowLoyalty('card')
  const program = programOf(businessId)
  const card = cardOf(businessId)
  if (!program || !card) return null
  if (program === STAMP_PROGRAM) {
    return {
      balance: card.balance,
      tierPoints: 9,
      tier: { currentTier: null, nextTier: null, pointsToNext: 0, progress: 0 },
      stamps: { catalogId: 47201, stampCount: 9, filled: Math.max(0, Math.min(9, card.balance)) },
      program,
    }
  }
  return {
    balance: card.balance,
    tierPoints: 170,
    tier: { currentTier: TIERS[0]!, nextTier: TIERS[1]!, pointsToNext: 30, progress: 0.85 },
    stamps: null,
    program,
  }
}

export async function getMyLoyaltyRewards(businessId: number, _token: string): Promise<MyLoyaltyReward[]> {
  await wait(160)
  await slowLoyalty('card')
  const card = cardOf(businessId)
  const list = card ? card.owned.filter((r) => r.status === 'available' || r.status === 'reserved').map((r) => ({ ...r })) : []
  // An answer the step cannot read: a reward without its terms.
  if (card && brokenLoyalty('reward')) list.push({ id: 4799, catalogId: 47199, status: 'available', expiresAt: null } as unknown as MyLoyaltyReward)
  return list
}

/**
 * The harness levers above, each used once per page load. `typeof` guard: the
 * mock also runs under bun:test, where there is no window.
 */
const usedLevers = new Set<string>()
function leverOnce<T>(name: string): T | null {
  const value = typeof window !== 'undefined' ? (window as any)[name] : undefined
  if (value == null || value === '' || usedLevers.has(name)) return null
  usedLevers.add(name)
  return value as T
}

export async function claimLoyaltyReward(businessId: number, p: ClaimInput, token: string | null): Promise<ClaimResult> {
  await wait(450)
  if (!token) return { ok: false, code: 'UNAUTHENTICATED' }
  const refusal = leverOnce<string>('__VIZYTO_MOCK_CLAIM_REFUSAL__')
  if (refusal) return { ok: false, code: refusal }
  const card = cardOf(businessId)
  if (!card) return { ok: false, code: 'LOYALTY_PROGRAM_NOT_FOUND' }
  const known = card.claims.get(p.idempotencyKey)
  if (known != null) return { ok: true, rewardId: known }
  const entry = (CATALOGS[businessId] ?? []).find((e) => e.id === p.catalogId)
  if (!entry) return { ok: false, code: 'REWARD_CATALOG_NOT_FOUND' }
  if (card.balance < p.pointsCost) {
    return { ok: false, code: 'INSUFFICIENT_POINTS', message: businessId === MOCK_LOYALTY_STAMPS ? 'Masz za mało pieczątek, aby odebrać tę nagrodę.' : 'Masz za mało Punktów, aby odebrać tę nagrodę.' }
  }
  const id = card.nextId++
  card.owned.push({
    id,
    catalogId: entry.id,
    status: 'available',
    expiresAt: entry.validityDays ? new Date(Date.now() + entry.validityDays * 86_400_000).toISOString() : null,
    termsSnapshot: {
      name: entry.name,
      kind: entry.kind,
      resolvedValue: entry.valueAtMin,
      scope: entry.scope,
      targets: entry.targets,
      selectedTargetKey: entry.kind === 'free_item' ? p.targetKey ?? null : null,
      minimumTotalGrosze: entry.minimumTotalGrosze,
      onSiteOnly: entry.onSiteOnly,
      stacksWithPromotions: entry.stacksWithPromotions,
    },
  })
  card.balance -= p.pointsCost
  card.claims.set(p.idempotencyKey, id)
  return { ok: true, rewardId: id }
}

/** The ordinary price of one class entry, as the timetable prices it. */
export async function quoteClassEntry(sessionId: number): Promise<PriceQuote | null> {
  await wait(150)
  await slowLoyalty('entry')
  const session = timetableRows().find((s) => s.id === sessionId)
  const cls = session ? GROUP_CLASSES.find((c) => c.id === session.groupClassId) : undefined
  const service = cls ? BUSINESS.services.find((s) => s.id === cls.businessServiceId) : undefined
  if (!session || !service) return null
  const listPrice = session.priceOverride ?? service.price
  const promo = session.promo ?? null
  const quote = quoteOf([{
    kind: 'group_class_entry', name: service.name, quantity: 1, listPrice: promo?.listPrice ?? listPrice,
    price: promo?.price ?? listPrice, promotionId: promo ? 1 : null,
    priorPrice: promo?.priorPrice ?? null, advertised: promo?.advertised ?? false, badge: promo?.badge ?? null,
  }])
  // An answer the step cannot read: a line that is not a line (the API's lines pass through as sent).
  return brokenLoyalty('entry') ? { ...quote, lines: [...quote.lines, null as unknown as PriceQuoteLine] } : quote
}

const ordinaryQuoteOf = (target: RewardQuoteTarget): Promise<PriceQuote | null> =>
  target.flow === 'appointment' ? quoteAppointment(target.payload)
    : target.flow === 'rental' ? quoteRental(target.payload)
      : quoteClassEntry(target.sessionId)

/** The appointment lever: a promotion on this add-on that the ordinary quote does not show. */
const hiddenPromotion = (target: RewardQuoteTarget, line: PriceQuoteLine | undefined) =>
  target.flow === 'appointment' && line?.kind === 'addon' && line.name === 'Peeling twarzy'

/** Applies one reward to the selected lines, the way the API allocates it. */
function applyMockReward(base: PriceQuote, reward: MyLoyaltyReward, lineIndexes: number[]): PriceQuote {
  const terms = reward.termsSnapshot
  let left = terms.kind === 'amount' ? terms.resolvedValue : 0
  const allocations: NonNullable<PriceQuote['reward']>['lines'] = []
  const lines = base.lines.map((line, index): PriceQuoteLine => {
    if (!lineIndexes.includes(index) || line.price == null) return line
    const before = line.price
    const discount = terms.kind === 'free_item'
      ? before
      : terms.kind === 'percent' ? Math.round((before * terms.resolvedValue) / 100) : Math.min(left, before)
    if (terms.kind === 'amount') left -= discount
    const price = before - discount
    allocations.push({
      index, price, discount, targetKey: `line:${index}`,
      // D29: a stacking reward counts from P; a free item replaces the promotion.
      ...(line.promotionId != null && terms.kind !== 'free_item' ? { promotionPrice: before } : {}),
    })
    return {
      ...line,
      price,
      rewardEligibility: { eligible: true, reason: null },
      ...(terms.kind === 'free_item' ? { promotionId: null, advertised: false, priorPrice: null, badge: null } : {}),
    }
  })
  const quote = quoteOf(lines)
  return {
    ...quote,
    pricingToken: `mock-reward-${reward.id}`,
    reward: {
      rewardId: reward.id,
      discount: allocations.reduce((sum, a) => sum + a.discount, 0),
      unusedAmount: terms.kind === 'amount' ? left : 0,
      lines: allocations,
    },
  }
}

const UNAVAILABLE = 'Ta nagroda jest niedostępna. Odśwież listę nagród.'

export async function quoteWithReward(
  businessId: number,
  target: RewardQuoteTarget,
  selection: RewardSelection,
  token: string | null,
): Promise<RewardQuoteResult> {
  await wait(220)
  await slowLoyalty('price')
  const card = cardOf(businessId)
  if (!token) return { ok: false, code: 'UNAUTHENTICATED' }
  if (!card) return { ok: false, code: 'LOYALTY_PROGRAM_NOT_FOUND' }
  if (typeof window !== 'undefined' && Number((window as any).__VIZYTO_MOCK_FAIL_REWARD_QUOTE__) === selection.rewardId && leverOnce('__VIZYTO_MOCK_FAIL_REWARD_QUOTE__')) {
    return { ok: false, code: 'NETWORK' }
  }
  const reward = card.owned.find((r) => r.id === selection.rewardId)
  if (!reward || reward.status !== 'available' || reward.termsSnapshot.onSiteOnly) return { ok: false, code: 'REWARD_UNAVAILABLE', message: UNAVAILABLE }
  const ordinary = await ordinaryQuoteOf(target)
  if (!ordinary) return { ok: false, code: 'SESSION_NOT_FOUND' }
  const terms = reward.termsSnapshot
  if (terms.kind === 'free_item' && selection.lineIndexes.length !== 1) return { ok: false, code: 'REWARD_UNAVAILABLE', message: UNAVAILABLE }
  if (terms.kind !== 'free_item' && !terms.stacksWithPromotions) {
    const conflicts = selection.lineIndexes.filter((i) => ordinary.lines[i]?.promotionId != null || hiddenPromotion(target, ordinary.lines[i]))
    if (conflicts.length) {
      return {
        ok: false,
        code: 'REWARD_DISCOUNT_CONFLICT',
        lineIndexes: conflicts,
        message: `Ta nagroda nie łączy się z promocją na pozycjach: ${conflicts.map((i) => ordinary.lines[i]!.name).join(', ')}. Wybierz inne pozycje.`,
      }
    }
  }
  return { ok: true, quote: applyMockReward(ordinary, reward, selection.lineIndexes) }
}

/** "18:00" in the business timezone. */
const localHour = (iso: string) => {
  try {
    return new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: BUSINESS.timezone || 'Europe/Warsaw' }).format(new Date(iso))
  } catch {
    return iso.slice(11, 16)
  }
}

/**
 * The reward checks of a create, after the slot checks: the reward must still be
 * on the card, the token must be the quote's, and the levers above fire here.
 * Success reserves the reward for this booking.
 */
async function rewardCreateRefusal(target: RewardQuoteTarget, reward: RewardFields | null | undefined): Promise<MockFailure | null> {
  if (!reward) return null
  const card = cardOf(mockBusinessId)
  const owned = card?.owned.find((r) => r.id === reward.rewardSelection.rewardId)
  if (!owned || owned.status !== 'available') return { ok: false, code: 'REWARD_UNAVAILABLE', message: UNAVAILABLE }
  if (owned.id === MOCK_REWARD_TAKEN_ELSEWHERE) {
    owned.status = 'reserved'
    return { ok: false, code: 'REWARD_UNAVAILABLE', message: UNAVAILABLE }
  }
  const terms = owned.termsSnapshot
  if (target.flow === 'rental' && localHour(target.payload.startDate) === '18:00' && terms.kind !== 'free_item' && !terms.stacksWithPromotions) {
    latePromotionStarts.add(target.payload.startDate)
    const pricing = await quoteRental(target.payload)
    return {
      ok: false,
      code: 'REWARD_DISCOUNT_CONFLICT',
      lineIndexes: [0],
      pricing,
      message: `Ta nagroda nie łączy się z promocją na pozycjach: ${pricing.lines[0]?.name ?? 'Wynajem'}. Wybierz inne pozycje.`,
    }
  }
  const expiresOnce = target.flow === 'class' && target.sessionId === MOCK_TOKEN_EXPIRES_SESSION && !expiredTokens.has(`${owned.id}:${target.sessionId}`)
  if (expiresOnce || reward.pricingToken !== `mock-reward-${owned.id}`) {
    expiredTokens.add(`${owned.id}:${target.flow === 'class' ? target.sessionId : ''}`)
    const fresh = await quoteWithReward(mockBusinessId, target, reward.rewardSelection, 'mock-token')
    return {
      ok: false,
      code: 'REWARD_QUOTE_EXPIRED',
      message: 'Wycena nagrody wygasła lub się zmieniła. Sprawdź aktualną cenę i potwierdź ponownie.',
      ...(fresh.ok ? { pricing: fresh.quote } : {}),
    }
  }
  owned.status = 'reserved'
  return null
}
