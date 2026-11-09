import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { Business, BookingWriteResult, CartItem, CartItemTime, Cfg, DayCounts, GroupClass, GroupSession, LoyaltyCatalogReward, LoyaltyProgramPublic, LoyaltyWallet, MyLoyaltyReward, OAuthProvider, OtpMode, PriceQuote, PromoBadges, PublicPromotionSummary, RentalDaySlots, Resource, RewardFields, RewardQuoteTarget, Service, ServiceCategory, Slots, TableDay, TableOptions, TableSlot } from './api'
import {
  addonNames,
  addonTotals,
  addonsValid,
  bookingIdempotencyKey,
  checkBookingAccess,
  checkEmail,
  checkWaitlistWindow,
  configuredTotals,
  createAppointment,
  checkRentalRange,
  claimLoyaltyReward,
  createRental,
  createTableReservation,
  getTableCounts,
  getTableDay,
  getTableOptions,
  joinTableWaitlist,
  tablesBookable,
  fetchGroupClasses,
  fetchTimetable,
  getRentalCounts,
  getRentalDaySlots,
  formatDuration,
  formatPrice2,
  priceLabel,
  getCartCounts,
  getCartFirstFree,
  getCartSlots,
  getLoyaltyCatalog,
  getLoyaltyProgram,
  getMyLoyalty,
  getMyLoyaltyRewards,
  getPromoBadges,
  getPromotionSummary,
  getServiceCategories,
  joinWaitlist,
  loginEmail,
  maskPhone,
  oauthLogin,
  priceRange,
  quoteAppointment,
  quoteClassEntry,
  quoteRental,
  quoteWithReward,
  isRangeUnit,
  registerForSession,
  rentalPrice,
  rentalUnitOptions,
  rentalUnitsLabel,
  resolveVariant,
  selectedAddons,
  sendGuestOtp,
  serviceHasOptions,
  slotLabel,
  slotStartDate,
  verifyGuestOtp,
  workerOffersService,
} from './api'
import { dayMonth, fullDate, nextDays, rentalSlotStartIso, ymd, zonedIso } from './dates'
import {
  DEFAULT_ADULTS,
  TABLE_CANCEL_RULE,
  TABLE_SLOT_GONE,
  childrenLine,
  countsWindow,
  holdRule,
  partyGenitive,
  partyRange,
  tableErrorMessage,
  tableIdempotencyKey,
  tablePartyLabel,
  tableWaitlistErrorMessage,
} from './tables'
import { StepTableParty } from './steps/StepTableParty'
import { StepTableTime } from './steps/StepTableTime'
import { StepClass, type ClassOption } from './steps/StepClass'
import { StepSession } from './steps/StepSession'
import { StepOffering, type OfferingKind } from './steps/StepOffering'
import { StepRentalItem, groupRentables, rentalOptionKey, type RentalOption } from './steps/StepRentalItem'
import { StepRentalTime } from './steps/StepRentalTime'
import { initialRentalOption, startingRentalOption, startingRentalUnits } from './rentalPrefill'
import {
  CLAIM_CLOSES,
  DONE_LOYALTY_WAIT_MS,
  PROGRAM_WAIT_MS,
  REWARD_READ_WAIT_MS,
  REWARD_RECOVERY,
  amountDueSentence,
  appointmentTargetKeys,
  applyRewardQuotes,
  bookingRewardLines,
  claimErrorMessage,
  claimedTerms,
  classEntryKey,
  classExpectedTotalOf,
  deriveRewardChoice,
  expectedTotalOf,
  formatPersonalTotal,
  formatPersonalTotalInline,
  hasRewardPricing,
  isStampProgram,
  newClaimKey,
  readRewardInputs,
  refusalMessage,
  refuseLines,
  rentalBaseKey,
  rewardCreateAction,
  selectionKey,
  settleWithin,
  withRewardKey,
  type BookingRewardLine,
  type ClaimableReward,
  type RewardFlow,
  type RewardQuoteState,
} from './loyalty'
import { StepReward, type RewardFocus, type RewardNotice } from './steps/StepReward'
import { resolveCartPolicy } from './policy'
import { classifyWriteFailure, publicChannelAllows, refusedActions, type CustomerAction } from './channel'
import {
  canPickPerItem,
  clearStaffPins,
  dropInvalidPins,
  enterPerItemMode,
  getItemProviderMode,
  getPinnedResourceIds,
  getResourcesForService,
  getStaffItems,
  setAllItemResources,
  setItemResource,
} from './providerMode'
import { noopEmit, type EmitFn } from './events'
import { ProgressBar } from './ui/ProgressBar'
import { Spinner } from './ui/Spinner'
import { Powered } from './ui/Powered'
import { ArrowLeft, ArrowRight, CalendarDays, Close } from './ui/icons'
import { SummaryCard, type SummaryRow } from './ui/SummaryCard'
import { SummaryPromoLine } from './ui/PromoBadge'
import { AvatarStack } from './ui/AvatarStack'
import { Button } from './ui/Button'
import { StepService, type CartChip } from './steps/StepService'
import { StepConfigure } from './steps/StepConfigure'
import { StepDetails } from './steps/StepDetails'
import { StepResource } from './steps/StepResource'
import { StepDateTime } from './steps/StepDateTime'
import { ItemProviders } from './steps/ItemProviders'
import { StepIdentify, type Contact } from './steps/StepIdentify'
import { StepWaitlist, type WaitlistPrefs } from './steps/StepWaitlist'
import { StepLogin } from './steps/StepLogin'
import { socialLogin } from './mountOptions'
import { StepOtp } from './steps/StepOtp'
import { StepDone } from './steps/StepDone'
import { Notice } from './ui/Notice'
import { Bell, Lock, Phone } from './ui/icons'
import { CdnImg } from './ui/CdnImg'

const HORIZON = 42
const OTP_RESEND_MS = 60_000

// Add whole days to a YYYY-MM-DD string in UTC (DST-safe).
const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

type ResChoice = number | 'any'

// One cart position as the widget holds it: the service plus ITS OWN variant,
// add-ons and provider. Keeping all of it on the line (instead of in flow-level
// state) is what makes a second service possible without the two overwriting
// each other - and what lets each service have its own specialist.
type CartLine = {
  service: Service
  /** Chosen length preset; null = the service's default (shortest) variant. */
  variantDuration: number | null
  addonIds: number[]
  /** undefined = nothing chosen yet, null = "bez preferencji", number = pinned. */
  resourceId?: number | null
}

// A fresh line defaults to the variant the API would pick on its own, so the
// price shown before any configuring matches what gets booked.
const newLine = (service: Service, resourceId?: number | null): CartLine => ({
  service,
  variantDuration: resolveVariant(service, null)?.durationMinutes ?? null,
  addonIds: [],
  resourceId,
})

/** "1 pozycja / 2 pozycje / 5 pozycji" - the sticky bar counts what is in the cart. */
const positionsLabel = (n: number) => {
  const last = n % 10
  const teens = n % 100
  if (n === 1) return '1 pozycja'
  if (last >= 2 && last <= 4 && (teens < 12 || teens > 14)) return `${n} pozycje`
  return `${n} pozycji`
}

/** Hard cap mirroring the API's MAX_CART_ITEMS - refuse the 9th politely. */
const MAX_CART_ITEMS = 8
type Phase = 'select' | 'identify' | 'login' | 'otp' | 'reward' | 'confirming' | 'done' | 'slotLost' | 'waitlist' | 'waitlistDone' | 'restricted' | 'closed'

/**
 * The policy action each offering family books under (#680). A table has no action
 * of its own: the API creates it as a visit and checks `book`, and the monorepo's
 * `publicTablesBookable` hides the family on the same switch.
 */
const KIND_ACTION: Record<OfferingKind, CustomerAction> = { service: 'book', class: 'groupClasses', rental: 'rentals', table: 'book' }

/**
 * The closed state, per what is closed. `all` = nothing this business sells can be
 * booked in this channel; a family = only that one (the others stay open).
 */
type ClosedFor = CustomerAction | 'all'
const CLOSED_TITLE: Record<ClosedFor, string> = {
  all: 'Rezerwacje online są teraz wyłączone',
  book: 'Umawianie wizyt online jest teraz wyłączone',
  groupClasses: 'Zapisy na zajęcia online są teraz wyłączone',
  rentals: 'Wynajem online jest teraz wyłączony',
  waitlist: 'Zapisy na listę oczekujących są teraz wyłączone',
  reschedule: 'Rezerwacje online są teraz wyłączone',
  cancel: 'Rezerwacje online są teraz wyłączone',
}
/** What the customer wanted to do, as the start of "..., zadzwoń do firmy". */
const CLOSED_GOAL: Record<ClosedFor, string> = {
  all: 'Aby umówić termin',
  book: 'Aby umówić wizytę',
  groupClasses: 'Aby zapisać się na zajęcia',
  rentals: 'Aby ustalić termin wynajmu',
  waitlist: 'Aby umówić termin',
  reschedule: 'Aby umówić termin',
  cancel: 'Aby umówić termin',
}
/**
 * A table books under `book`, but a guest who picked "Stolik" was not making an
 * appointment: the closed state names the table instead.
 */
const CLOSED_TABLE = { title: 'Rezerwacje stolików online są teraz wyłączone', goal: 'Aby zarezerwować stolik' }
/**
 * The steps INSIDE the 'select' phase, addressed by name rather than by index.
 * Which of them exist depends on the cart (the provider step disappears when
 * there is nothing to choose), so an index alone cannot say which step it is.
 */
type SelStepId = 'offering' | 'service' | 'provider' | 'time' | 'class' | 'session' | 'rental' | 'rentalTime' | 'tableParty' | 'tableTime'
// Whether the identify/auth path finishes by booking a slot or joining a waitlist.
type Intent = 'book' | 'waitlist'
export type Auth = { userId: number; token: string | null }

/**
 * The reward step's inputs (vizyto #471 F37), read when the customer is known
 * and the booking is about to be created. `gen` changes with every new reading,
 * so a late answer about an earlier one is dropped.
 */
type RewardOffer = {
  gen: number
  flow: RewardFlow
  auth: Auth
  wallet: LoyaltyWallet
  owned: MyLoyaltyReward[]
  catalog: LoyaltyCatalogReward[]
  /** The ordinary quote: "Obecna cena", and what "Bez nagrody" books with. */
  ordinary: PriceQuote
  lines: BookingRewardLine[]
  refused: Record<number, number[]>
  quotes: Record<number, RewardQuoteState>
}
/** A reward a create carries: its fields, its name for the receipt and the quote it was priced with. */
type ChosenReward = { fields: RewardFields; name: string; quote: PriceQuote }
/** The success screen's program block; `wallet` is null when the customer has no card here yet. */
type DoneLoyalty = { program: LoyaltyProgramPublic; wallet: LoyaltyWallet | null; catalog: LoyaltyCatalogReward[] }

/**
 * Server codes for a class sign-up, as sentences with a way out. Same job as the
 * appointment error map, and deliberately the same wording as the Vizyto app so a
 * customer who sees it in both places reads one product.
 */
function registerErrorMessage(code: string): string {
  switch (code) {
    case 'ENTRY_DISABLED':
      return 'Te zajęcia wymagają zapisu na okres. Zapisz się w aplikacji Vizyto.'
    case 'SESSION_FULL':
      return 'Ten termin jest już pełny. Wybierz inny.'
    case 'ALREADY_REGISTERED':
      return 'Masz już zapis na ten termin.'
    case 'REGISTRATION_WINDOW_CLOSED':
      return 'Zapisy na ten termin zostały już zamknięte.'
    case 'SESSION_NOT_OPEN':
      return 'Ten termin nie jest już otwarty na zapisy. Wybierz inny.'
    case 'GROUP_CLASS_PAUSED':
      return 'Zapisy na te zajęcia są chwilowo wstrzymane.'
    case 'GROUP_CLASS_FIXED_ROSTER':
      return 'Na te zajęcia zapisuje organizator. Skontaktuj się z nim, aby dołączyć.'
    case 'INCOMPLETE_PROFILE':
      return 'Uzupełnij imię, nazwisko i numer telefonu - lista obecności jest imienna.'
    case 'SESSION_NOT_FOUND':
      return 'Tego terminu już nie ma w grafiku. Wybierz inny.'
    default:
      return 'Nie udało się zapisać na zajęcia. Spróbuj ponownie.'
  }
}

/** The receipt of a booking with a reward: the reward named, and the price it was booked at. */
function withRewardRows(rows: SummaryRow[], used: ChosenReward | null, priceLabelText: string): SummaryRow[] {
  if (!used) return rows
  return [
    ...rows.filter((r) => !r.total),
    { label: 'Nagroda', value: used.name },
    { label: priceLabelText, value: formatPersonalTotal(used.quote.total), total: true },
  ]
}

/** Where a rental booking points: the pool of a type, or one exact instance. */
function rentalTarget(o: RentalOption): { resourceId?: number; rentalTypeId?: number } {
  return o.pooled ? { rentalTypeId: o.head.rentalTypeId ?? undefined } : { resourceId: o.head.id }
}

/**
 * The [start, end] window a rental occupies, in UTC.
 *
 * Slot mode gets its start from the picked hour tile: the tile's own instant
 * from the day grid (`grid`), or its wall-clock time converted in the business
 * timezone. Range mode (day/week/month) has no hour to pick, so the start is the
 * business opening time on that weekday, in the BUSINESS timezone, bumped past
 * "now" for today - the same rule the counts endpoint applies and the same
 * derivation the WEB and CLIENT wizards make. The naive alternative (the day's
 * UTC midnight) is 02:00 local in Poland and lands outside every published
 * rental window, so the availability check refuses the whole calendar. The
 * server still validates the exact instant on create.
 *
 * The end is start + units * unit length, which is the same arithmetic the shared
 * pricer bills against. Returns null when the business is closed that day.
 */
function rentalWindow(
  o: RentalOption,
  date: string,
  units: number,
  slotLocal: string,
  business: Business,
  grid?: RentalDaySlots | null,
): { startDate: string; endDate: string } | null {
  if (!date) return null
  const unit = o.head.rentalUnit ?? 'hour'
  const ms = { minute: 60_000, hour: 3_600_000, day: 86_400_000, week: 7 * 86_400_000, month: 30 * 86_400_000 }[unit]

  let startIso: string | null
  if (isRangeUnit(unit)) {
    startIso = rangePickupIso(business, date)
  } else {
    // `slotLocal` is the tile's wall-clock time in the business timezone, not a
    // UTC key: the tile's own instant (or a zoned conversion) is the pickup.
    const tiles = grid?.mode === 'slots' ? grid.slots : null
    startIso = rentalSlotStartIso(date, slotLocal, business.timezone || 'Europe/Warsaw', tiles)
  }
  if (!startIso) return null
  const start = new Date(startIso)
  if (Number.isNaN(start.getTime())) return null
  const end = new Date(start.getTime() + ms * Math.max(1, units))
  return { startDate: start.toISOString(), endDate: end.toISOString() }
}

/** Opening instant of `date` in the business timezone, never in the past. */
function rangePickupIso(business: Business, date: string): string | null {
  const dow = new Date(`${date}T00:00:00`).getDay()
  const wh = business.workingHours?.find((h) => h.dayOfWeek === dow)
  if (!wh || !wh.isOpened) return null
  const tz = business.timezone || 'Europe/Warsaw'
  const iso = zonedIso(date, (wh.openTime || '09:00').slice(0, 5), tz)
  if (!iso) return null
  const start = Date.parse(iso)
  const now = Date.now()
  if (start > now) return iso
  // Today, opening already passed: the earliest realistic pickup is the next
  // quarter-hour (strictly future), which is what the counts endpoint counted.
  return new Date(Math.ceil((now + 1) / 900_000) * 900_000).toISOString()
}

/** Hour of a materialized term, in the BUSINESS timezone (not the visitor's). */
function sessionHour(iso: string, tz: string | null | undefined): string {
  try {
    return new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: tz || 'Europe/Warsaw' }).format(new Date(iso))
  } catch {
    return iso.slice(11, 16)
  }
}

/**
 * Server codes for a rental, as sentences with a way out.
 *
 * The API answers several of these in ENGLISH (`"Rental not available"`), which
 * both the WEB and CLIENT wizards pass straight through to a toast. The widget
 * sits on a customer's own site, so it maps them itself rather than showing the
 * visitor a raw API string.
 */
function rentalErrorMessage(code: string): string {
  switch (code) {
    case 'RENTAL_SLOT_UNAVAILABLE':
    case 'RENTAL_POOL_EXHAUSTED':
      return 'Ten termin właśnie został zajęty. Wybierz inny.'
    case 'RENTAL_OUTSIDE_SCHEDULE':
      return 'W tym czasie nie wypożyczamy. Wybierz inny termin.'
    case 'RENTAL_BELOW_MIN_DURATION':
      return 'Ten okres jest krótszy niż minimalny czas wynajmu.'
    case 'RENTAL_ABOVE_MAX_DURATION':
      return 'Ten okres jest dłuższy niż maksymalny czas wynajmu.'
    case 'RENTAL_RANGE_TOO_LONG':
      return 'Za długi zakres. Wybierz krótszy okres.'
    case 'RENTAL_NOT_AVAILABLE':
    case 'RENTAL_RESOURCE_NOT_RENTABLE':
      return 'Ten przedmiot nie jest teraz dostępny do wynajęcia.'
    case 'INCOMPLETE_PROFILE':
      return 'Uzupełnij imię, nazwisko i numer telefonu, aby zarezerwować.'
    default:
      return 'Nie udało się zarezerwować. Spróbuj ponownie.'
  }
}

const emptyContact: Contact = { firstName: '', lastName: '', phone: '', email: '' }

/**
 * What the HOST page already knows. A timetable row on a club's site knows which
 * class was clicked (and sometimes which term), so passing it here is what makes
 * the difference between "sign up in place" and "sign up, then pick the thing you
 * just clicked all over again" - the exact bug the vizyto.com hand-off had.
 */
export type Prefill = { serviceId?: number; resourceId?: number; rentalTypeId?: number; classId?: number; sessionId?: number; kind?: OfferingKind }

export function BookingFlow({
  cfg,
  business,
  prefill,
  preAuth,
  onClose,
  onChannelRefused,
  emit = noopEmit,
}: {
  cfg: Cfg
  business: Business
  prefill?: Prefill
  preAuth?: Auth
  onClose?: () => void
  /**
   * A write came back 409 CHANNEL_*: the profile this flow was mounted with is
   * stale. The host re-reads it, keeps the fresh copy for every later mount and
   * resolves with it (null when the read failed).
   */
  onChannelRefused?: () => Promise<Business | null>
  emit?: EmitFn
}) {
  const services = useMemo(() => business.services.filter((s) => s.bookingType !== 'group'), [business])
  // The backing rows for group classes live in the SAME list, flagged 'group'.
  // The 1:1 flow filters them out (above); the class flow resolves them by id.
  const groupServices = useMemo(() => business.services.filter((s) => s.bookingType === 'group'), [business])

  // ---- group classes ------------------------------------------------------
  const [groupClasses, setGroupClasses] = useState<GroupClass[] | null>(null)
  const [sessions, setSessions] = useState<GroupSession[] | null>(null)
  const [loadingSessions, setLoadingSessions] = useState(false)
  // Classes are only fetched when the business actually has group-type services,
  // so a barbershop pays for nothing.
  const mayHaveClasses = groupServices.length > 0
  const classOptions = useMemo<ClassOption[]>(() => {
    if (!groupClasses) return []
    return groupClasses
      // A fixed roster is filled by the organiser from linked customer groups and
      // the server refuses self sign-up, so it must never appear as bookable.
      // Filtered HERE, not inside the fetch: a rule that lives in the transport
      // layer silently skips mock mode, which is the only test surface this repo
      // has - and it did.
      .filter((cls) => cls.attendanceMode !== 'fixed')
      .map((cls) => {
        const service = groupServices.find((s) => s.id === cls.businessServiceId)
        return service ? { cls, service } : null
      })
      .filter((o): o is ClassOption => o !== null)
  }, [groupClasses, groupServices])
  const hasClasses = classOptions.length > 0
  const hasServices = services.length > 0

  // ---- rentals ------------------------------------------------------------
  // No fetch at all: the rentables and their full rental config arrive in the same
  // business payload the widget already has (publicResourceDTO). Grouped into
  // OFFERS, so a pool of ten identical lanes is one card, not ten rows.
  const rentalOptions = useMemo<RentalOption[]>(() => groupRentables(business.resources), [business])
  const hasRentals = rentalOptions.length > 0
  /**
   * Oferta wskazana przez stronę-gospodarza. Karta pojazdu w wypożyczalni
   * podaje `resourceId`, bo klient wybrał już KONKRETNY bus - kalendarz ma
   * pokazać doby tego egzemplarza, a nie listę, na której trzeba go znaleźć
   * drugi raz. Karta puli (np. „Tor x 6 szt.” na stronie /r/) podaje
   * `rentalTypeId` - wtedy od razu kalendarz puli, a egzemplarz przydziela
   * serwer. Prefill jest PODPOWIEDZIĄ: gdy oferta zniknęła, typ jest nieznany
   * albo sam `resourceId` należy do puli, zostaje zwykły wybór z listy.
   */
  const initialRental = useMemo<RentalOption | null>(
    () => initialRentalOption(rentalOptions, prefill),
    [rentalOptions, prefill?.resourceId, prefill?.rentalTypeId],
  )

  // The prefill's offer, else the only one there is: a business renting one thing
  // has no list step, so its time step must start on it. The length starts at the
  // offer's minimum, as a tap on the list does.
  const [rentalPick, setRentalPick] = useState<RentalOption | null>(() => startingRentalOption(rentalOptions, prefill))
  const [rentalUnits, setRentalUnits] = useState(() => startingRentalUnits(rentalPick))
  const [rentalParty, setRentalParty] = useState(1)
  const [rentalCounts, setRentalCounts] = useState<DayCounts>({})
  const [rentalSlots, setRentalSlots] = useState<RentalDaySlots | null>(null)
  const [rentalLoading, setRentalLoading] = useState(false)
  const [rentalRangeOk, setRentalRangeOk] = useState<boolean | null>(null)

  // ---- restaurant tables (#903 F11) ---------------------------------------
  // Offered only for a business in the tables pilot (strict, like the shared
  // publicTablesBookable). The party, zone and picked start are the family's own;
  // the day reuses the flow's `date`, like the rental branch.
  const tablesOn = useMemo(() => tablesBookable(business), [business])
  // The API answered 404 TABLES_NOT_AVAILABLE (pilot switched off after load).
  const [tableGone, setTableGone] = useState(false)
  const [tableAdults, setTableAdults] = useState(DEFAULT_ADULTS)
  const [tableChildren, setTableChildren] = useState(0)
  const [tableZoneId, setTableZoneId] = useState<number | null>(null)
  // undefined = not read yet, null = the read failed (limits 10/4, no zone chips).
  const [tableOptions, setTableOptions] = useState<TableOptions | null | undefined>(undefined)
  const [tableCounts, setTableCounts] = useState<DayCounts>({})
  const [tableCountsReady, setTableCountsReady] = useState(false)
  const [tableDay, setTableDay] = useState<TableDay | null>(null)
  const [tableLoading, setTableLoading] = useState(false)
  const [tableErr, setTableErr] = useState(false)
  const [tableSlot, setTableSlot] = useState<TableSlot | null>(null)
  // The empty-day waitlist runs through the same identify path as a booking.
  const [tableWl, setTableWl] = useState(false)
  const [tableNotice, setTableNotice] = useState<{ title: string; text: string } | null>(null)
  const guests = tableAdults + tableChildren
  // isCustomerSelectable is what the business uses to keep somebody off the
  // public picker. The per-service helpers honour it, so the cart-wide list has
  // to as well - otherwise the same person is offered on one screen and hidden
  // on the next.
  const workers = useMemo(
    () => business.resources.filter((r) => r.type === 'worker' && (r as any).isCustomerSelectable !== false),
    [business],
  )

  // selection (declared here because offeringWorkers below depends on the cart;
  // the rest of the selection state follows further down).
  const initialServiceRef = useMemo(() => services.find((s) => s.id === prefill?.serviceId) ?? null, [services, prefill?.serviceId])

  // Seed the provider of a PREFILLED service (a tapped barber CTA), or settle it
  // outright when there is nothing to ask: undefined = the question stands and
  // the pick step has to be shown, null = "bez preferencji", number = pinned.
  const initialPick = useMemo<number | null | undefined>(() => {
    const svc = initialServiceRef
    if (!svc) return undefined
    // 'auto' wins over the prefill: the business decided the server assigns, so a
    // pinned worker from open({resourceId}) must never reach the payload.
    if (getItemProviderMode(svc) === 'auto') return null
    if (getItemProviderMode(svc) === 'unit') {
      const tag = ((svc.primaryObjectCategoryTag ?? '') as string).trim() || null
      const units = tag
        ? business.resources.filter(
            (r) =>
              r.type === 'object' &&
              r.isBookable !== false &&
              r.isCustomerSelectable !== false &&
              (((r.categoryTag ?? '') as string).trim() || null) === tag,
          )
        : []
      if (prefill?.resourceId && units.some((u) => u.id === prefill.resourceId)) return prefill.resourceId
      if (units.length === 0) return null
      if (units.length === 1) return units[0]!.id
      return undefined
    }
    const candidates = getResourcesForService(workers, svc)
    if (prefill?.resourceId && candidates.some((w) => w.id === prefill.resourceId)) return prefill.resourceId
    if (candidates.length === 0) return null
    if (candidates.length === 1) return candidates[0]!.id
    return undefined
  }, [initialServiceRef, workers, business, prefill?.resourceId])

  // The CART: array order = chain order (the engine books positions back to back).
  // Variant, add-ons AND the provider live PER LINE - that is the whole point of
  // the per-service mode, and the API has always accepted resourceId per item.
  const [lines, setLines] = useState<CartLine[]>(
    initialServiceRef ? [newLine(initialServiceRef, initialPick)] : [],
  )
  const lineOf = (serviceId: number) => lines.find((l) => l.service.id === serviceId)
  const cartServices = useMemo(() => lines.map((l) => l.service), [lines])
  // Terms for THIS cart, not for the business: a position may impose a longer
  // notice or block online cancelling outright, and the strictest one applies to
  // the whole chain (see ./policy).
  const cartPolicy = useMemo(
    () => resolveCartPolicy(cartServices, business.bookingPolicy),
    [cartServices, business.bookingPolicy],
  )

  // A service can be offered by only a subset of workers, each possibly with an
  // overridden price/duration. The candidate list is the INTERSECTION: only
  // workers who perform EVERY position can take the whole cart alone. With an
  // empty cart the whole team drives structure.
  const offeringWorkers = useMemo(
    () => (lines.length
      ? workers.filter((w) => cartServices.every((svc) => workerOffersService(svc, w.id)))
      : workers),
    [workers, cartServices, lines.length],
  )

  // Offerings-pool F2/F3: a service is either staff-realized (customer picks a
  // worker) or unit-realized (customer picks an object from the primary pool, or
  // "Dowolny"). providerSelection 'auto' means the server assigns and there is no
  // pick step at all.
  // Cart-wide, jak w kreatorze WEB (computeIsUnitBooking / computeAllProvidersAuto
  // / computeUnitPickTag): a MIXED cart falls back to the staff path, and the
  // per-position guard in buildCartItems keeps a worker id off the pool lines.
  const isUnit = lines.length > 0 && cartServices.every((s) => s.fulfillmentMode === 'unit')
  const providerAuto = lines.length > 0 && cartServices.every((s) => s.providerSelection === 'auto')
  // Trim both sides of the pool match (web computeUnitPickTag/getSelectableUnits
  // trim too): a whitespace-bearing tag must not silently empty the pool. One
  // shared tag only - two different pools have no single "Dowolny" to offer.
  const unitTag = useMemo(() => {
    if (!isUnit) return null
    let tag: string | null = null
    for (const svc of cartServices) {
      const t = ((svc.primaryObjectCategoryTag ?? '') as string).trim() || null
      if (!t || (tag && tag !== t)) return null
      tag = t
    }
    return tag
  }, [isUnit, cartServices])
  // Bookable, customer-selectable objects of the cart's primary pool.
  const poolUnits = useMemo(() => {
    if (!lines.length || !isUnit || !unitTag) return []
    return business.resources.filter(
      (r) =>
        r.type === 'object' &&
        r.isBookable !== false &&
        r.isCustomerSelectable !== false &&
        (((r.categoryTag ?? '') as string).trim() || null) === unitTag,
    )
  }, [business, lines.length, isUnit, unitTag])
  // Whoever the customer chooses among for this service (memoized for stable
  // effect/memo deps).
  const selectableProviders = useMemo(() => (isUnit ? poolUnits : offeringWorkers), [isUnit, poolUnits, offeringWorkers])

  // With 0-1 providers, or providerSelection 'auto', there's no pick step: it is
  // skipped and the progress is a 3-step flow. "od" (from) pricing only applies
  // when a staff service's price can vary between workers.
  // The step also has to exist when NOBODY covers the whole cart alone (0 shared
  // workers) or exactly one person does: "Dowolny" is a real alternative there -
  // splitting the visit usually opens up more hours than blocking the only person
  // who does everything, and with 0 shared workers it is the ONLY way. Skipping
  // the step hid that and made the "kto co wykona" explanation dead code.
  // Per-position mode is worth offering only when it would give a different
  // answer than "one person for everything" - at least two staff positions, at
  // least one with a real choice.
  const canPerItem = useMemo(() => !isUnit && canPickPerItem(lines, workers), [isUnit, lines, workers])

  const hasResourceStep = !providerAuto && (
    selectableProviders.length > 1
    || canPerItem
    || (lines.length > 1 && !isUnit && workers.length > 1)
  )
  const providerStepName = isUnit ? 'WYBÓR ZASOBU' : 'WYBÓR SPECJALISTY'
  /**
   * The selection steps that ACTUALLY exist for this cart, in order.
   *
   * Replaces the old `selStep: 0 | 1 | 2` plus a `hasResourceStep` boolean, where
   * every consumer had to re-derive "is index 1 the provider or the time step?"
   * on its own (`termIdx`, the progress mapping, the back handler, the CTA guard).
   * Adding a fourth family of offering would have meant touching each of those
   * again; with the list as the single source of truth they all read from it.
   */
  /**
   * Which family the customer is booking. Resolved without a question whenever
   * only one exists (a barbershop never sees a fork, a club with only classes
   * never sees one either), and taken from the prefill when the host page already
   * said - a timetable CTA passing `classId` means the choice is made, and so
   * does a `resourceId` that names a rentable instance (a vehicle card on a
   * rental company's page) or a `rentalTypeId` that names a rental pool (a lane
   * card on the /r/ page) when no other family is named.
   */
  const askedKind: OfferingKind | null =
    prefill?.kind ??
    (prefill?.classId != null || prefill?.sessionId != null
      ? 'class'
      : prefill?.serviceId != null
        ? 'service'
        : initialRental
          ? 'rental'
          : null)
  const [kind, setKind] = useState<OfferingKind | null>(askedKind)
  /** Families this business actually sells. */
  const soldKinds = useMemo<OfferingKind[]>(() => {
    const out: OfferingKind[] = []
    if (hasServices) out.push('service')
    if (mayHaveClasses) out.push('class')
    if (hasRentals) out.push('rental')
    // Last, so a mixed business reads as before. When the API says the pilot is
    // off, the card goes - unless it was the only family, which then explains why.
    if (tablesOn && !(tableGone && out.length > 0)) out.push('table')
    return out
  }, [hasServices, mayHaveClasses, hasRentals, tablesOn, tableGone])

  /**
   * Per-channel booking policy (#680). The widget books in `cfg.channel`
   * (`widget` on an external site, `website` on vizyto.com's guest page), and a
   * family the business does not take there is not offered at all - the same
   * pre-check CLIENT and WEB make, so the customer never walks a whole flow into
   * a 409. `refused` holds actions the API turned down at submit time while
   * the profile still allowed them (the owner switched them off after this page
   * loaded): from then on they count as closed too.
   */
  const [refused, setRefused] = useState<CustomerAction[]>([])
  const allows = (action: CustomerAction) => publicChannelAllows(business, cfg.channel, action) && !refused.includes(action)
  /** Families this business sells AND takes in this channel - the fork never offers a dead branch. */
  const kinds = useMemo<OfferingKind[]>(
    () => soldKinds.filter((k) => allows(KIND_ACTION[k])),
    [soldKinds, business, refused],
  )
  /**
   * What is closed before the flow starts. Nothing to offer at all is the
   * whole-widget state (also for a business that sells nothing yet, when visits
   * are closed - there is no family to name). A prefill that names a closed
   * family (a timetable CTA when classes are switched off) gets that family's
   * state instead of a silent detour into another one.
   */
  const [initialClosed] = useState<ClosedFor | null>(() => {
    if (kinds.length === 0 && (soldKinds.length > 0 || !allows('book'))) return 'all'
    if (askedKind && soldKinds.includes(askedKind) && !kinds.includes(askedKind)) return KIND_ACTION[askedKind]
    return null
  })
  const needsOfferingStep = kind === null && kinds.length > 1
  /**
   * Clamped to what the business actually sells. A host page can hand us a family
   * this business does not have - a stale `classId` on a page whose club moved its
   * schedule off Vizyto, say - and honouring it would open a catalog with nothing
   * in it. Falling back to the first real family shows the customer something they
   * can buy; the step clamp below then moves them off the step that vanished.
   */
  const effKind: OfferingKind = (kind && kinds.includes(kind) ? kind : null) ?? kinds[0] ?? 'service'

  /**
   * The NUMBERED steps of the chosen family. The offering fork is deliberately not
   * one of them: until the family is known there is nothing to number, and
   * "KROK 1 Z 2" on a fork that leads to a 4-step flow would be a lie. It renders
   * as a gate before the counter starts.
   */
  const selectSteps = useMemo<SelStepId[]>(() => {
    if (effKind === 'class') return ['class', 'session']
    // The summary lives on the identify step, as in every other family.
    if (effKind === 'table') return ['tableParty', 'tableTime']
    // A single rentable offer needs no catalog step - the customer already chose
    // by opening the widget on a page that rents one thing.
    if (effKind === 'rental') return rentalOptions.length > 1 ? ['rental', 'rentalTime'] : ['rentalTime']
    return hasResourceStep ? ['service', 'provider', 'time'] : ['service', 'time']
  }, [effKind, hasResourceStep, rentalOptions.length])

  const STEP_LABEL: Record<SelStepId, string> = {
    offering: 'CO REZERWUJESZ',
    service: 'WYBÓR USŁUGI',
    provider: providerStepName,
    time: 'WYBÓR TERMINU',
    class: 'WYBÓR ZAJĘĆ',
    session: 'WYBÓR TERMINU',
    rental: 'WYBÓR PRZEDMIOTU',
    rentalTime: 'WYBÓR TERMINU',
    tableParty: 'LICZBA OSÓB',
    tableTime: 'WYBÓR TERMINU',
  }
  const stepNames = [...selectSteps.map((id) => STEP_LABEL[id]), 'TWOJE DANE']
  const totalSteps = stepNames.length

  // selection
  // Per-position mode CANNOT be derived from the cart: a cart where every
  // position is still "bez preferencji" looks exactly like "Bez preferencji" for
  // everything. So the mode the customer picked is carried explicitly.
  const [eachMode, setEachMode] = useState(false)
  // The customer chose "Bez preferencji" for the whole cart. Refining WHO takes
  // the picked hour keeps this true: availability must stay union-wide (or the
  // day would shrink to that one person and the refinement would be a one-way
  // door), and the picker must stay on screen so the choice can be changed.
  const [anyChosen, setAnyChosen] = useState(initialPick === null)
  // configure sub-step (variants + add-ons) for the picked service. Auto-opens
  // when the service offers choices; hidden otherwise. variantDuration = chosen
  // length preset (null = default shortest); addonIds = selected add-ons.
  // Which cart line is open in the configure sub-step (null = none). Per line,
  // so configuring the 2nd service never disturbs the 1st.
  const [configuringId, setConfiguringId] = useState<number | null>(
    initialServiceRef && serviceHasOptions(initialServiceRef) ? initialServiceRef.id : null,
  )
  const configuring = configuringId != null
  const configuringLine = configuringId != null ? lineOf(configuringId) : undefined
  // Podgląd szczegółów usługi (galeria + pełny opis) nakładany na listę - jak
  // arkusz "service/Details" na profilu w Vizyto. Osobny od konfiguracji:
  // szczegóły ogląda się PRZED wyborem, warianty konfiguruje po.
  const [detailsId, setDetailsId] = useState<number | null>(null)
  const detailsService = detailsId != null ? services.find((s) => s.id === detailsId) : undefined
  const [date, setDate] = useState('')
  const [slotKey, setSlotKey] = useState('')
  const [counts, setCounts] = useState<DayCounts>({})
  const [slots, setSlots] = useState<Slots>([])
  // Chain geometry + per-slot candidates from the last availability answer.
  const [chain, setChain] = useState<{ itemTimes: CartItemTime[]; totalMinutes: number; slotCandidates?: Record<string, number[][]> } | null>(null)
  const [loadingSlots, setLoadingSlots] = useState(false)
  // Transient one-liner under the service list (pin dropped, cart cap reached).
  // { title, text } - a cap refusal and a dropped pin are different events and
  // must not share a heading. Cleared by the next composition change.
  const [cartNotice, setCartNotice] = useState<{ title: string; text: string } | null>(null)
  // "Najbliższy wolny termin": in flight + a latch once a sweep came back empty,
  // so we stop offering a search that already failed for this cart.
  const [findingNext, setFindingNext] = useState(false)
  const [noneAhead, setNoneAhead] = useState(false)
  const [refetch, setRefetch] = useState(0)
  // Which selection step is on screen - skip ahead when prefilled. A prefilled
  // service that offers variants/add-ons stays on the service step so the customer
  // configures it (auto-opened above) before advancing.
  const [stepId, setStepId] = useState<SelStepId>(() => {
    // Class branch: a prefilled term jumps straight past both steps, a prefilled
    // class past the first. This is what turns a timetable click on the club's own
    // page into "confirm your details" instead of "now find that class again".
    if (prefill?.classId != null || prefill?.sessionId != null || prefill?.kind === 'class') {
      return prefill?.classId != null || prefill?.sessionId != null ? 'session' : 'class'
    }
    if (needsOfferingStep) return 'offering'
    // A venue that only takes tables opens on the party, like a rentals-only one.
    if (!initialServiceRef && kinds.length === 1 && kinds[0] === 'table') return 'tableParty'
    // Before the rental branch: an explicit `kind: 'table'` wins over a `resourceId`
    // that happens to name a rentable, as it does in `askedKind`.
    if (prefill?.kind === 'table') return 'tableParty'
    if (prefill?.kind === 'rental' || initialRental) {
      // Trafiony prefill egzemplarza przeskakuje listę - tak samo jak klik
      // w termin zajęć przeskakuje wybór kursu.
      return initialRental || rentalOptions.length <= 1 ? 'rentalTime' : 'rental'
    }
    if (initialServiceRef && serviceHasOptions(initialServiceRef)) return 'service'
    if (initialServiceRef && initialPick !== undefined) return 'time'
    if (initialServiceRef) return 'provider'
    return 'service'
  })
  // The class the customer is signing up for, and the term.
  const [classPick, setClassPick] = useState<ClassOption | null>(null)
  const [sessionId, setSessionId] = useState<number | null>(prefill?.sessionId ?? null)
  /**
   * Index of the step on screen, or -1 when it is not in the list at all.
   *
   * -1 is reachable: a cart change can remove the provider step (dropping to one
   * selectable person) while the customer is standing on it. The old numeric state
   * kept rendering that step while the progress bar relabelled index 1 as
   * "WYBÓR TERMINU" - the widget's own version of the "Krok 0 z 3" dead end the
   * apps had. The effect below clamps it instead.
   */
  const stepIndex = selectSteps.indexOf(stepId)
  // Second availability answer for an empty day, asked with every pin removed:
  // 'others' = the chosen people are busy but somebody else is free, 'none' =
  // the day itself is closed/full. Without it an empty day cannot say WHY.
  const [emptyProbe, setEmptyProbe] = useState<'others' | 'none' | null>(null)

  // flow
  const [phase, setPhase] = useState<Phase>(initialClosed ? 'closed' : 'select')
  const [closedFor, setClosedFor] = useState<ClosedFor | null>(initialClosed)
  // Closed before anything started: tell the host page once per mount, so a site
  // can hide its own "book" buttons or log it (`channel_closed`, stage 'load').
  useEffect(() => {
    if (initialClosed) emit('channel_closed', { action: initialClosed, stage: 'load' })
  }, [])
  const [contact, setContact] = useState<Contact>(emptyContact)
  const [notes, setNotes] = useState('')
  // Status the server ACTUALLY gave the booking - 'pending' when the business
  // confirms manually (autoConfirmAppointments=false). The success screen must
  // not announce "Zarezerwowane!" for a visit that still awaits approval.
  const [bookedStatus, setBookedStatus] = useState<string | null>(null)
  const [emailExists, setEmailExists] = useState(false)
  const [auth, setAuth] = useState<Auth | null>(preAuth ?? null)

  // Service categories (optional grouping) fetched from a separate public endpoint.
  const [categories, setCategories] = useState<ServiceCategory[]>([])
  const [promotionSummary, setPromotionSummary] = useState<PublicPromotionSummary | null>(null)
  const [appointmentBadges, setAppointmentBadges] = useState<PromoBadges | null>(null)
  const [rentalBadges, setRentalBadges] = useState<PromoBadges | null>(null)
  const [quote, setQuote] = useState<PriceQuote | null>(null)

  // ---- whitelist gate (bookingAccess) ----
  // accessOk = the viewer is confirmed allowed to book at business level.
  // Starts false for a 'restricted' business until a post-login probe says yes
  // (fetchBusiness is anonymous, so viewerCanBook is null there).
  const initialAccessOk = business.bookingAccess?.policy !== 'restricted' || business.bookingAccess?.viewerCanBook === true
  const [accessOk, setAccessOk] = useState(initialAccessOk)
  // Availability/counts answered 403 BOOKING_ACCESS_RESTRICTED for this viewer:
  // the calendar shows a login invitation instead of a silently empty grid.
  const [calRestricted, setCalRestricted] = useState(false)

  // The identify/auth path can end in a booking or a waitlist sign-up.
  const [intent, setIntent] = useState<Intent>('book')
  const [wlPrefs, setWlPrefs] = useState<WaitlistPrefs | null>(null)
  const [wlBusy, setWlBusy] = useState(false)
  const [wlErr, setWlErr] = useState('')

  // otp
  const [code, setCode] = useState('')
  // Cloudflare Turnstile token (anti-toll-fraud on the SMS path). Single-use:
  // captured from the visible widget, consumed by a send, then cleared so the
  // next send re-gates. Only enforced when cfg.turnstileKey is configured.
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [otpInfo, setOtpInfo] = useState({ maskedPhone: '', expiresAt: 0, resendAt: 0, codeLength: 6 })
  // 'login' = this phone already has a Vizyto account; the code doubles as a login.
  const [otpMode, setOtpMode] = useState<OtpMode>('guest')
  const [attemptsLeft, setAttemptsLeft] = useState(3)
  const [now, setNow] = useState(() => Date.now())

  // busy + errors
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)
  const [oauthBusy, setOauthBusy] = useState<OAuthProvider | null>(null)
  const [identifyErr, setIdentifyErr] = useState('')
  const [otpErr, setOtpErr] = useState('')
  const [loginErr, setLoginErr] = useState('')
  const [loginReason, setLoginReason] = useState('')
  const [bookingErr, setBookingErr] = useState('')
  const [priceChanged, setPriceChanged] = useState(false)
  const booking = useRef(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const probedFor = useRef('')

  // ---- loyalty rewards (vizyto #471 F37) ----
  // The public program, read once per mount and only once the customer gives their
  // details or books: a visitor who only browses makes no loyalty request, and a
  // business without a program costs one 404. Tables and waitlists never touch it.
  const programReq = useRef<Promise<LoyaltyProgramPublic | null> | null>(null)
  const [offer, setOfferState] = useState<RewardOffer | null>(null)
  // Mirrors `offer` for the async pricing rounds, which outlive the render that started them.
  const offerRef = useRef<RewardOffer | null>(null)
  const offerGen = useRef(0)
  const offering = useRef(false)
  const [rewardChoice, setRewardChoice] = useState<number | null>(null)
  // A reward claimed in the step: chosen as soon as it is priced.
  const preferredReward = useRef<number | null>(null)
  // The claim panel that had focus closed with a claim: focus waits for its reward.
  const claimFocus = useRef(false)
  // Where focus goes once the control that had it left the step (StepReward applies it).
  const [rewardFocus, setRewardFocus] = useState<RewardFocus | null>(null)
  const [rewardNotice, setRewardNotice] = useState<RewardNotice | null>(null)
  // The card, rewards and prices are being read: a quiet spinner, not "Rezerwuję".
  const [rewardChecking, setRewardChecking] = useState(false)
  // The reward the last create carried, so "Spróbuj ponownie" sends it again.
  const [activeReward, setActiveReward] = useState<ChosenReward | null>(null)
  // A fresh reward quote with another total, waiting for the customer's yes.
  const [rewardRepriced, setRewardRepriced] = useState<ChosenReward | null>(null)
  const [claim, setClaim] = useState<{ item: ClaimableReward; key: string } | null>(null)
  const [claimBusy, setClaimBusy] = useState(false)
  const [claimErr, setClaimErr] = useState('')
  // What the success screen shows: the reward used, and the program block.
  const [usedReward, setUsedReward] = useState<ChosenReward | null>(null)
  const [doneLoyalty, setDoneLoyalty] = useState<DoneLoyalty | null>(null)
  const setOffer = (next: RewardOffer | null) => {
    offerRef.current = next
    setOfferState(next)
  }

  // The CART-WIDE answer, read back from the positions: 'any' when every one of
  // them is explicitly "bez preferencji", an id when they all carry the SAME
  // provider, null when the question is still open (or the answers differ, which
  // only per-position mode can produce).
  const cartResource: ResChoice | null = useMemo(() => {
    if (!lines.length) return null
    const first = lines[0]!.resourceId
    if (first === undefined) return null
    if (!lines.every((l) => l.resourceId === first)) return null
    return first === null ? 'any' : first
  }, [lines])
  /** The worker pinned to ONE position - the price/duration this line is booked at. */
  const lineWorker = (l: CartLine): number | undefined =>
    getItemProviderMode(l.service) === 'staff' && typeof l.resourceId === 'number' ? l.resourceId : undefined

  // Which resourceId ONE position may carry. A cart-wide pick is a WORKER, so it
  // must not land on a pool position ('unit' - the engine wants an object there
  // and answers with zero slots for the whole day) nor on a position the business
  // assigns itself ('auto'). Same rule as WEB's resolveItemResourceId.
  const itemResourceId = (l: CartLine): number | null => {
    const kind = getItemProviderMode(l.service)
    if (kind === 'auto') return null
    if (kind === 'unit') {
      const picked = typeof l.resourceId === 'number' ? business.resources.find((r) => r.id === l.resourceId) : undefined
      return picked?.type === 'object' ? picked.id : null
    }
    return typeof l.resourceId === 'number' ? l.resourceId : null
  }

  // The cart as the API wants it: array order = chain order, each position with
  // its OWN variant length, add-ons and provider, so availability and create
  // always agree on the chain shape.
  const buildCartItems = (opts?: { forAvailability?: boolean; unpinned?: boolean }): CartItem[] => lines.map((l) => ({
    businessServiceId: l.service.id,
    // Availability in "Bez preferencji" mode ignores a slot-level refinement on
    // purpose (parytet z availabilityItems w WEB); create uses the concrete pick.
    // `unpinned` is the diagnosis probe for an empty day - the same cart asked
    // without anybody pinned. In per-position mode the pins ARE the question, so
    // they are never widened silently.
    resourceId: opts?.unpinned || (opts?.forAvailability && anyChosen) ? null : itemResourceId(l),
    addonIds: l.addonIds.length ? l.addonIds : undefined,
    durationMinutes: l.variantDuration ?? undefined,
  }))

  // Stable dep for availability effects: composition, variants and add-ons all
  // change the chain length, so counts/slots must refetch when any of them move.
  // What the availability payload actually carries: in "Bez preferencji" mode the
  // pin is erased before sending, so refining WHO takes a slot must not refetch
  // the exact same body (it blanked the grid and lost focus).
  const availabilityResourceKey = anyChosen ? 'any' : lines.map((l) => itemResourceId(l) ?? 'any').join(',')
  const cartKey = lines
    .map((l) => `${l.service.id}:${l.variantDuration ?? ''}:${l.addonIds.slice().sort((a, b) => a - b).join('.')}`)
    .join('|')
  const quoteResourceKey = lines.map((l) => itemResourceId(l) ?? 'any').join(',')
  const days = useMemo(() => nextDays(HORIZON), [])
  // The cart-wide provider (worker or pool unit); undefined for "Bez preferencji",
  // per-position mode and auto.
  const pinnedResource: Resource | undefined = typeof cartResource === 'number' ? business.resources.find((r) => r.id === cartResource) : undefined
  const anyProviderLabel = isUnit ? (unitTag ? `Dowolny: ${unitTag}` : 'Dowolny') : 'Bez preferencji'
  const providerRowLabel = isUnit ? 'Zasób' : 'Specjalista'
  // Distinct people pinned across the cart, in position order - drives the
  // summary chip (one name vs an avatar stack).
  const pinnedPeople = useMemo(
    () =>
      getPinnedResourceIds(lines)
        .map((id) => business.resources.find((r) => r.id === id))
        .filter((r): r is Resource => !!r),
    [lines, business],
  )
  const someUnassigned = getStaffItems(lines).some((l) => l.resourceId == null)
  // At least one position carries a chosen SPECIALIST - so a pin can be the reason
  // a day is empty. A pool object is not a person, and "sprawdź wszystkich
  // specjalistów" would be the wrong way out of a fully booked loża.
  const anyPinned = getStaffItems(lines).some((l) => typeof l.resourceId === 'number')
  // How the visit reads in one line. A mix keeps both halves of the truth: who is
  // pinned, and that the rest is up to us.
  const providerName = (() => {
    if (!pinnedPeople.length) return anyProviderLabel
    if (pinnedPeople.length === 1 && !someUnassigned) return pinnedPeople[0]!.name
    if (pinnedPeople.length > 2) return 'Wielu specjalistów'
    return `${pinnedPeople.map((p) => p.name).join(', ')}${someUnassigned ? ' + bez preferencji' : ''}`
  })()

  useEffect(() => {
    let cancelled = false
    getServiceCategories(cfg).then((c) => !cancelled && setCategories(c))
    return () => {
      cancelled = true
    }
  }, [])

  // One anonymous summary after the business loads, then a personalized refresh
  // after login. Failure deliberately clears all promotion decoration.
  useEffect(() => {
    let cancelled = false
    getPromotionSummary(cfg, auth?.userId, auth?.token).then((summary) => {
      if (!cancelled) setPromotionSummary(summary)
    })
    return () => { cancelled = true }
  }, [auth?.userId, auth?.token])

  // bookedById resolves the whitelist gate for the logged-in user (anonymously
  // a restricted business 403s), so both queries re-run after authentication.
  useEffect(() => {
    if (!lines.length) return
    let cancelled = false
    getCartCounts(cfg, {
      startDate: days[0],
      endDate: days[days.length - 1],
      items: buildCartItems({ forAvailability: true }),
      bookedById: auth?.userId,
      token: auth?.token,
    }).then((x) => {
      if (cancelled) return
      setCounts(x.counts)
      setCalRestricted(x.restricted)
    })
    return () => {
      cancelled = true
    }
  }, [cartKey, availabilityResourceKey, refetch, auth?.userId])

  // A different cart may well have free days - forget the previous verdict.
  useEffect(() => { setNoneAhead(false) }, [cartKey, availabilityResourceKey])

  // Per-position mode stops making sense once the cart drops below two staff
  // positions: leaving it on would show a distribution with nothing to distribute.
  useEffect(() => {
    if (eachMode && !canPerItem) setEachMode(false)
  }, [eachMode, canPerItem])

  useEffect(() => {
    if (!lines.length || !date) {
      setSlots([])
      setChain(null)
      return
    }
    let cancelled = false
    setLoadingSlots(true)
    // Ask for per-slot candidates only when they can drive a real choice: one
    // position, "Dowolny", staff-realized (a pool has its own pick step).
    const wantsCandidates = lines.length === 1 && anyChosen && !isUnit && !providerAuto
    getCartSlots(cfg, { date, items: buildCartItems({ forAvailability: true }), bookedById: auth?.userId, token: auth?.token, includeCandidates: wantsCandidates })
      .then((x) => {
        if (cancelled) return
        setSlots(x.slots)
        setChain({ itemTimes: x.itemTimes, totalMinutes: x.totalMinutes, slotCandidates: x.slotCandidates })
        if (x.restricted) setCalRestricted(true)
      })
      .finally(() => !cancelled && setLoadingSlots(false))
    return () => {
      cancelled = true
    }
  }, [cartKey, availabilityResourceKey, date, refetch, auth?.userId])

  useEffect(() => {
    if (effKind !== 'service' || !lines.length) {
      setAppointmentBadges(null)
      return
    }
    let cancelled = false
    getPromoBadges(cfg, {
      target: { kind: 'cart', items: buildCartItems({ forAvailability: true }) },
      dates: days,
      slots: date ? { date, times: slots } : null,
      bookedById: auth?.userId,
    }, auth?.token).then((badges) => {
      if (!cancelled) setAppointmentBadges(badges)
    })
    return () => { cancelled = true }
  }, [effKind, cartKey, availabilityResourceKey, date, slots.join('|'), auth?.userId, auth?.token])

  // An empty day with somebody pinned has TWO possible causes, and they lead to
  // different ways out. The same cart asked once more with nobody pinned tells
  // them apart: slots => the chosen people are busy, none => the day itself is
  // shut. Skipped when nothing is pinned (the first answer already covered it).
  useEffect(() => {
    if (!lines.length || !date || loadingSlots || slots.length > 0 || anyChosen || !anyPinned) {
      setEmptyProbe(null)
      // Leaving the day drops its verdict, so the latch has to drop with it -
      // otherwise coming back to the same empty day would show the neutral
      // "no slots" state and never re-run the diagnosis.
      probedFor.current = ''
      return
    }
    // The same day can report "empty" twice in a row (stale slots while the next
    // answer is in flight) - one probe per cart+day is enough.
    const key = `${date}|${cartKey}|${availabilityResourceKey}|${refetch}`
    if (probedFor.current === key) return
    probedFor.current = key
    let cancelled = false
    getCartSlots(cfg, { date, items: buildCartItems({ unpinned: true }), bookedById: auth?.userId, token: auth?.token }).then((x) => {
      if (!cancelled) setEmptyProbe(x.slots.length ? 'others' : 'none')
    })
    return () => {
      cancelled = true
    }
  }, [cartKey, availabilityResourceKey, date, slots, loadingSlots, refetch, auth?.userId])

  useEffect(() => {
    if (phase !== 'otp') return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [phase])

  // Scroll each step back to the top so long lists don't start mid-way.
  useEffect(() => {
    bodyRef.current?.scrollTo(0, 0)
  }, [phase, stepId])

  /**
   * Load the class wrappers once, and only for a business that has group-type
   * services. `business.services` already carries the name, price, description,
   * images and the whitelist verdict, so this is the only class read the catalog
   * step needs.
   */
  useEffect(() => {
    if (!mayHaveClasses || !kinds.includes('class') || groupClasses !== null) return
    let cancelled = false
    fetchGroupClasses(cfg).then((rows) => { if (!cancelled) setGroupClasses(rows) })
    return () => { cancelled = true }
  }, [mayHaveClasses, kinds, groupClasses])

  /**
   * Load the timetable when the customer actually enters the class branch.
   *
   * The window is 6 weeks on purpose. On the server this read doubles as the
   * safety net that materializes missing terms, and asking for a year there is
   * what once turned a club profile into a 31-second page. Six weeks is more than
   * any class schedule a customer plans against.
   */
  const timetableReq = useRef(false)
  useEffect(() => {
    if (effKind !== 'class' || sessions !== null || groupClasses === null) return
    // The in-flight guard is a REF, not state: with `loadingSessions` in the
    // dependency list this effect's own setState re-ran it, the cleanup flipped
    // `cancelled`, and the answer was thrown away - leaving the timetable on a
    // spinner forever.
    if (timetableReq.current) return
    timetableReq.current = true
    const from = new Date()
    const to = new Date()
    to.setDate(to.getDate() + 42)
    setLoadingSessions(true)
    fetchTimetable(cfg, { from: from.toISOString(), to: to.toISOString() }).then((rows) => {
      timetableReq.current = false
      const allowedClassIds = new Set(groupClasses.map((cls) => cls.id))
      setSessions(rows.filter((session) => allowedClassIds.has(session.groupClassId)))
      setLoadingSessions(false)
    })
  }, [effKind, sessions, groupClasses])

  /**
   * Resolve a prefilled class id against the loaded list. Until the list lands the
   * step machine has already been told to stand on 'session'; if the id turns out
   * to be stale (class deleted, or a customer site holding an old id) fall back to
   * the class list rather than showing a term list for nothing.
   */
  useEffect(() => {
    if (effKind !== 'class' || classPick || !groupClasses) return
    if (prefill?.classId == null) return
    const found = classOptions.find((o) => o.cls.id === prefill.classId)
    if (found) setClassPick(found)
    else if (stepId === 'session') setStepId('class')
  }, [effKind, classPick, groupClasses, classOptions, prefill?.classId, stepId])

  /**
   * The same resolution from the other direction: a page whose timetable lists
   * concrete terms knows the TERM id, not necessarily the class wrapping it, so
   * `open({ sessionId })` has to be enough on its own. Without this the flow
   * stood on the term step with an empty list and no way to explain why.
   */
  useEffect(() => {
    if (effKind !== 'class' || classPick || !sessions || !groupClasses) return
    if (prefill?.classId != null || prefill?.sessionId == null) return
    const s = sessions.find((x) => x.id === prefill.sessionId)
    const found = s ? classOptions.find((o) => o.cls.id === s.groupClassId) : null
    if (found) setClassPick(found)
    else if (stepId === 'session') setStepId('class')
  }, [effKind, classPick, sessions, groupClasses, classOptions, prefill?.classId, prefill?.sessionId, stepId])

  /** Terms of the chosen class, soonest first. */
  const classSessions = useMemo(() => {
    if (!sessions || !classPick) return []
    return sessions
      .filter((x) => x.groupClassId === classPick.cls.id)
      .slice()
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
  }, [sessions, classPick])
  const chosenSession = useMemo(
    () => classSessions.find((x) => x.id === sessionId) ?? null,
    [classSessions, sessionId],
  )

  /**
   * A prefilled term has to clear the same bar a tapped one does. StepSession
   * refuses to select a full term, but a host page handing us `sessionId` from
   * its own timetable goes around that guard - the CTA would then offer a
   * sign-up the server answers with SESSION_FULL, and the customer would read
   * that as our failure. So the moment the terms land, drop a prefill that no
   * longer holds: full, or not in this class's window at all (stale id, cancelled
   * term - the fetch already drops those, or simply further out than six weeks).
   * Dropping it leaves the customer standing on the list, which is where the
   * choice belongs anyway.
   */
  useEffect(() => {
    if (sessionId == null || !sessions || !classPick) return
    const s = classSessions.find((x) => x.id === sessionId)
    if (!s || s.availability === 'full') setSessionId(null)
  }, [sessionId, sessions, classPick, classSessions])

  /**
   * Rental availability. Two reads, chosen by the billing unit:
   *  - day pills for the strip (always), narrowed by length AND party size,
   *    because both change which days are even possible;
   *  - per-day slots for minute/hour, whose answer also TELLS us the mode
   *    ({mode:'range'} for day+), so the time step never has to guess.
   * Re-runs on every input the server prices against; a stale grid would offer
   * hours the create path refuses.
   */
  useEffect(() => {
    if (effKind !== 'rental' || !rentalPick) return
    const target = rentalTarget(rentalPick)
    const from = days[0]
    const to = days[days.length - 1]
    if (!from || !to) return
    let cancelled = false
    getRentalCounts(cfg, { ...target, from, to, units: rentalUnits, partySize: rentalParty }).then((c) => {
      if (!cancelled) setRentalCounts(c)
    })
    return () => { cancelled = true }
  }, [effKind, rentalPick, rentalUnits, rentalParty, days[0], refetch])

  /**
   * Seed the day when the rental time step opens.
   *
   * Nothing else does it: the visit flow seeds today from its own effect, and
   * without a day here `day-slots` is never called - so the step could not even
   * learn whether it is a grid or a range, and rendered length pills over an empty
   * body. Seeds the first day the counts report as free (falling back to today),
   * so a closed Monday does not greet the customer with "brak wolnych godzin".
   */
  useEffect(() => {
    if (effKind !== 'rental' || !rentalPick || date) return
    const firstFree = days.find((d) => (rentalCounts[d] ?? 0) > 0)
    const seedDay = firstFree ?? days[0]
    if (seedDay) setDate(seedDay)
  }, [effKind, rentalPick, date, rentalCounts, days[0]])

  useEffect(() => {
    if (effKind !== 'rental' || !rentalPick || !date) return
    const target = rentalTarget(rentalPick)
    let cancelled = false
    setRentalLoading(true)
    getRentalDaySlots(cfg, { ...target, date, units: rentalUnits, partySize: rentalParty }).then((r) => {
      if (cancelled) return
      setRentalSlots(r)
      setRentalLoading(false)
    })
    return () => { cancelled = true }
  }, [effKind, rentalPick, date, rentalUnits, rentalParty, refetch])

  useEffect(() => {
    if (effKind !== 'rental' || !rentalPick) {
      setRentalBadges(null)
      return
    }
    const target = rentalTarget(rentalPick)
    const times = rentalSlots?.mode === 'slots' ? rentalSlots.slots.map((slot) => slot.start.slice(11, 16)) : []
    let cancelled = false
    getPromoBadges(cfg, {
      // Priced for the chosen length: the answer's `lowest` is the summary's "od X".
      target: { kind: 'rental', ...target, units: rentalUnits },
      dates: days,
      slots: date && times.length ? { date, times } : null,
      bookedById: auth?.userId,
    }, auth?.token).then((badges) => {
      if (!cancelled) setRentalBadges(badges)
    })
    return () => { cancelled = true }
  }, [effKind, rentalPick, date, rentalSlots, rentalUnits, auth?.userId, auth?.token])

  /**
   * Range mode has no grid to pick from, so the window itself has to be checked
   * before the CTA unlocks - otherwise "Dalej" would walk the customer through
   * identity only to be refused at create.
   */
  useEffect(() => {
    if (effKind !== 'rental' || !rentalPick || !date) return
    if (rentalSlots?.mode !== 'range') { setRentalRangeOk(null); return }
    const win = rentalWindow(rentalPick, date, rentalUnits, '', business)
    // No opening hours that weekday: the window cannot exist, so say so instead
    // of keeping the previous day's answer (which could leave the CTA unlocked).
    if (!win) { setRentalRangeOk(false); return }
    let cancelled = false
    setRentalRangeOk(null)
    checkRentalRange(cfg, { ...rentalTarget(rentalPick), startDate: win.startDate, endDate: win.endDate }).then((ok) => {
      if (!cancelled) setRentalRangeOk(ok)
    })
    return () => { cancelled = true }
  }, [effKind, rentalPick, date, rentalUnits, rentalSlots?.mode, refetch])

  /**
   * Restaurant tables (#903 F11). The options (zones, limits, confirmation mode) are
   * read once when the family opens; the counts and the day only on the time step,
   * so tapping through the party pills costs no requests (counts: 30/min per IP).
   */
  useEffect(() => {
    if (effKind !== 'table' || tableOptions !== undefined) return
    let cancelled = false
    getTableOptions(cfg, auth?.token).then((o) => {
      if (cancelled) return
      setTableOptions(o)
      if (!o) return
      // Into the venue's own limits, and drop a zone it no longer offers.
      const { maxAdults, maxChildren } = partyRange(o)
      setTableAdults((n) => Math.min(n, maxAdults))
      setTableChildren((n) => Math.min(n, maxChildren))
      setTableZoneId((z) => (z != null && o.zones.length >= 2 && o.zones.some((x) => x.id === z) ? z : null))
    })
    return () => { cancelled = true }
  }, [effKind, tableOptions])

  const onTableTime = effKind === 'table' && stepId === 'tableTime' && !tableGone
  useEffect(() => {
    if (!onTableTime) return
    let cancelled = false
    setTableCountsReady(false)
    // The API takes at most 31 days per call, so the 42-day strip is two calls.
    Promise.all(
      countsWindow(days).map((w) => getTableCounts(cfg, { ...w, guests, zoneId: tableZoneId }, auth?.token)),
    ).then((rs) => {
      if (cancelled) return
      if (rs.some((r) => r.gone)) { dropTables(); return }
      setTableCounts(Object.assign({}, ...rs.map((r) => r.counts)))
      if (rs.some((r) => r.restricted)) setCalRestricted(true)
      setTableCountsReady(true)
    })
    return () => { cancelled = true }
  }, [onTableTime, guests, tableZoneId, auth?.token, refetch])

  // Seed the first day with a free start (today otherwise), once the counts land.
  useEffect(() => {
    if (!onTableTime || date || !tableCountsReady) return
    const seed = days.find((d) => (tableCounts[d] ?? 0) > 0) ?? days[0]
    if (seed) setDate(seed)
  }, [onTableTime, date, tableCountsReady, tableCounts])

  useEffect(() => {
    if (!onTableTime || !date) return
    let cancelled = false
    setTableLoading(true)
    setTableErr(false)
    getTableDay(cfg, { date, guests, zoneId: tableZoneId }, auth?.token).then((r) => {
      if (cancelled) return
      setTableLoading(false)
      if (r.gone) { dropTables(); return }
      if (r.restricted) { setTableDay(null); setCalRestricted(true); return }
      setTableDay(r.day)
      setTableErr(!r.day)
    })
    return () => { cancelled = true }
  }, [onTableTime, date, guests, tableZoneId, refetch, auth?.token])

  // The chosen start is the first moment the server can own the complete price.
  // Every input that can change it invalidates the old answer; route failures
  // simply leave quote null, preserving the legacy local-price flow.
  useEffect(() => {
    let cancelled = false
    setQuote(null)
    setPriceChanged(false)
    if (effKind === 'service' && lines.length && date && slotKey) {
      quoteAppointment(cfg, {
        items: buildCartItems(),
        startDate: slotStartDate(date, slotKey, business.timezone || 'Europe/Warsaw'),
        bookedById: auth?.userId,
      }, auth?.token).then((next) => { if (!cancelled) setQuote(next) })
    } else if (effKind === 'rental' && rentalPick && date) {
      const ready = rentalSlots?.mode === 'range' ? rentalRangeOk === true : !!slotKey
      const win = ready ? rentalWindow(rentalPick, date, rentalUnits, slotKey, business, rentalSlots) : null
      if (win) {
        quoteRental(cfg, {
          ...rentalTarget(rentalPick),
          ...win,
          partySize: rentalPick.head.rentalMaxPartySize != null ? rentalParty : null,
          bookedById: auth?.userId,
        }, auth?.token).then((next) => { if (!cancelled) setQuote(next) })
      }
    }
    return () => { cancelled = true }
  }, [effKind, cartKey, quoteResourceKey, date, slotKey, rentalPick ? rentalOptionKey(rentalPick) : '', rentalUnits, rentalParty, rentalSlots?.mode, rentalRangeOk, auth?.userId, auth?.token])

  /**
   * Clamp when the step on screen stops existing.
   *
   * A cart edit can remove the provider step under the customer's feet (e.g. the
   * second service narrows the shared staff down to one person). Falling back to
   * the service step is the honest move: the provider answer that step collected
   * no longer applies, and the time step would be reached without it.
   */
  useEffect(() => {
    if (phase !== 'select') return
    // 'offering' is a gate BEFORE the numbered steps, so it is legitimately absent
    // from the list - never clamp it away.
    if (stepId === 'offering') return
    if (stepIndex === -1) setStepId(selectSteps[0] ?? 'service')
  }, [phase, stepIndex, stepId])

  // Effective price/duration for the current configuration: chosen variant +
  // add-ons + any per-employee override for the worker pinned to THAT position.
  // When nothing pins the price yet (no worker, no variant), fall back to the
  // "od {min}" range across the offering workers.
  // Cart totals: every position priced at its own pinned worker's rate (or its
  // base), summed. One position still priced as a range makes the whole total a
  // range, so "od" propagates up - jak w kreatorze WEB.
  const cartTotals = lines.reduce(
    (acc, l) => {
      const t = configuredTotals(l.service, l.variantDuration, l.addonIds, lineWorker(l))
      return { price: acc.price + t.price, duration: acc.duration + t.duration }
    },
    { price: 0, duration: 0 },
  )
  const lineIsRange = (l: CartLine) => {
    if (lineWorker(l)) return false
    if ((l.service.durationOptions?.length ?? 0) > 0) return false
    const r = priceRange(l.service, workers.filter((w) => workerOffersService(l.service, w.id)))
    return r.min !== r.max
  }
  const showFrom = lines.length > 0 && lines.some(lineIsRange)
  // Lower bound when at least one position is a range: cheapest performer per
  // position + that position's add-ons.
  const cartFromPrice = lines.reduce((sum, l) => {
    const performers = workers.filter((w) => workerOffersService(l.service, w.id))
    const r = priceRange(l.service, performers)
    const variant = resolveVariant(l.service, l.variantDuration)
    const base = variant?.priceCents ?? (lineIsRange(l) ? r.min : configuredTotals(l.service, l.variantDuration, [], lineWorker(l)).price)
    return sum + base + addonTotals(l.service, l.addonIds).price
  }, 0)
  const shownPrice = showFrom ? cartFromPrice : cartTotals.price
  const shownDuration = cartTotals.duration
  // Price used for analytics/booking value: exact configured totals (the backend
  // assigns the final price for "Dowolny"; base + add-ons is our best estimate).
  const selectedPrice = cartTotals.price

  // One row per position (with its variant + add-ons folded into the label), then
  // the shared provider, the time and the total. A 1-item cart reads exactly like
  // before; a chain shows what it is made of.
  const summaryRows: SummaryRow[] = lines.length
    ? [
        ...lines.map((l) => {
          const variant = resolveVariant(l.service, l.variantDuration)
          const hasVariantChoice = (l.service.durationOptions?.length ?? 0) > 0
          const names = addonNames(l.service, l.addonIds)
          const extras = [
            ...(hasVariantChoice && variant ? [variant.label || formatDuration(variant.durationMinutes)] : []),
            ...names,
          ]
          // Per-position mode: the row has to say who takes THIS service, or the
          // summary would flatten a mixed cart back into one anonymous answer.
          const who = eachMode && getItemProviderMode(l.service) === 'staff'
            ? business.resources.find((r) => r.id === l.resourceId)?.name ?? 'bez preferencji'
            : null
          return {
            label: l.service.name,
            value: [
              ...(extras.length ? [extras.join(' · ')] : [formatDuration(configuredTotals(l.service, l.variantDuration, l.addonIds, lineWorker(l)).duration)]),
              ...(who ? [`u: ${who}`] : []),
            ].join(' · '),
          }
        }),
        { label: providerRowLabel, value: providerName },
        { label: 'Termin', value: `${dayMonth(date)}, ${slotLabel(date, slotKey, business.timezone)}` },
        // An advertised quote renders its own price block under the rows. Any
        // other quote only makes the ordinary row exact: it is the price the
        // booking sends as expectedTotal and the CTA bar already shows.
        ...(quote?.advertised
          ? []
          : [{ label: 'Cena', value: quote?.total != null ? priceLabel(quote.total) : priceLabel(shownPrice, showFrom), total: true }]),
      ]
    : []

  /**
   * The time step's promotion in the booking summary (#430, DESIGN.md §3.5). The
   * badges answer carries the lowest marked total of THIS cart with its 30-day
   * price; the picked hour's quote replaces it; an hour without the promotion keeps
   * its own price and the summary names the promotion beside it.
   */
  const markedLowest = effKind === 'service' ? appointmentBadges?.lowest ?? null : null
  const pickedPromo = slotKey && quote?.advertised && quote.total != null && quote.priorTotal != null
    ? { total: quote.total, priorTotal: quote.priorTotal }
    : null
  const summaryPromo = stepId === 'time' && (pickedPromo ?? markedLowest)
    ? { ...(pickedPromo ?? markedLowest)!, isFrom: !pickedPromo, offTerm: !pickedPromo && !!slotKey }
    : null

  /** First numbered step of a family - used by the fork and by restart(). */
  const firstStepOf = (k: OfferingKind): SelStepId =>
    k === 'class' ? 'class'
      : k === 'rental' ? (rentalOptions.length > 1 ? 'rental' : 'rentalTime')
        : k === 'table' ? 'tableParty'
          : 'service'

  /**
   * Is the rental answer complete? Slot mode needs a picked hour; range mode needs
   * the window to have come back available. Deliberately NOT "date is set": a
   * range whose check failed must keep the CTA shut.
   */
  const rentalReady = Boolean(
    rentalPick && date && (
      rentalSlots?.mode === 'range' ? rentalRangeOk === true : !!slotKey
    ),
  )

  const rentalSummaryRows: SummaryRow[] = rentalPick
    ? (() => {
        const unit = rentalPick.head.rentalUnit ?? 'hour'
        const total = rentalPrice(rentalPick.head, rentalUnits)
        const win = rentalWindow(rentalPick, date, rentalUnits, slotKey, business, rentalSlots)
        const fmt = (iso: string) => {
          try {
            return new Intl.DateTimeFormat('pl-PL', {
              day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
              timeZone: business.timezone || 'Europe/Warsaw',
            }).format(new Date(iso))
          } catch { return iso.slice(0, 16).replace('T', ' ') }
        }
        return [
          {
            label: 'Przedmiot',
            // A pool answers with the TYPE - the instance is the server's to pick,
            // so naming one here would be a promise we do not control.
            value: rentalPick.pooled ? (rentalPick.head.rentalTypeName ?? rentalPick.head.name) : rentalPick.head.name,
          },
          ...(win ? [{ label: 'Odbiór', value: fmt(win.startDate) }, { label: 'Zwrot', value: fmt(win.endDate) }] : []),
          { label: 'Czas', value: rentalUnitsLabel(rentalUnits, unit) },
          ...(rentalPick.head.rentalMaxPartySize != null ? [{ label: 'Osoby', value: String(rentalParty) }] : []),
          ...(rentalPick.head.rentalDeposit != null
            ? [{ label: 'Kaucja (na miejscu)', value: formatPrice2(rentalPick.head.rentalDeposit) }]
            : []),
          ...(!quote?.advertised && (quote?.total ?? total) != null
            ? [{ label: 'Kwota', value: formatPrice2((quote?.total ?? total)!), total: true }]
            : []),
        ]
      })()
    : []

  /**
   * The rental time step's promotion in the booking summary (#430, DESIGN.md §3.5):
   * the badges answer's lowest marked price of this length with its 30-day price,
   * the chosen term's quote once picked; a term without the promotion keeps its own
   * price and the summary names the promotion beside it.
   */
  // An hour grid needs its hour; a range term is the day itself.
  const rentalTermChosen = !!rentalPick && (rentalSlots?.mode !== 'slots' || !!slotKey)
    && !!rentalWindow(rentalPick, date, rentalUnits, slotKey, business, rentalSlots)
  const rentalPicked = rentalTermChosen && quote?.advertised && quote.total != null && quote.priorTotal != null
    ? { total: quote.total, priorTotal: quote.priorTotal }
    : null
  const rentalMarked = rentalBadges?.lowest ?? null
  const rentalSummaryPromo = effKind === 'rental' && stepId === 'rentalTime' && (rentalPicked ?? rentalMarked)
    ? { ...(rentalPicked ?? rentalMarked)!, isFrom: !rentalPicked, offTerm: !rentalPicked && rentalTermChosen }
    : null

  /**
   * Reserve a rental - the third create path, and again a sibling of book() rather
   * than a branch inside it. A rental has no chain, no slot to lose in the visit
   * sense, and its own refusal vocabulary; what it shares is the envelope.
   */
  async function reserveRental(a: Auth, pricing: PriceQuote | null = quote, reward: ChosenReward | null = null, retried = false) {
    if (!rentalPick || booking.current) return
    const win = rentalWindow(rentalPick, date, rentalUnits, slotKey, business, rentalSlots)
    if (!win) return
    booking.current = true
    setBookingErr('')
    setPriceChanged(false)
    setRewardRepriced(null)
    setActiveReward(reward)
    setPhase('confirming')
    const target = rentalTarget(rentalPick)
    const ctx = { rental: rentalOptionKey(rentalPick), units: rentalUnits, businessId: business.id }
    emit('booking_submitted', { ...ctx, userId: a.userId })
    const trimmedNotes = notes.trim() || undefined
    const loyaltyRead = readDoneLoyalty(a)
    const r = await createRental(
      cfg,
      {
        ...target,
        startDate: win.startDate,
        endDate: win.endDate,
        bookedById: a.userId,
        notes: trimmedNotes,
        partySize: rentalPick.head.rentalMaxPartySize != null ? rentalParty : null,
        ...expectedTotalOf(pricing, reward),
        idempotencyKey: withRewardKey(
          `vzw-rnt-${business.id}-${win.startDate}-${target.resourceId ?? 't' + target.rentalTypeId}-${rentalUnits}-${a.userId}`,
          reward?.fields.rewardSelection.rewardId,
        ),
        reward: reward?.fields ?? null,
      },
      a.token,
    )
    booking.current = false
    if (r.ok) {
      const loyalty = await doneLoyaltyOf(loyaltyRead)
      setBookedStatus(r.data?.status ?? 'reserved')
      setUsedReward(reward)
      setDoneLoyalty(loyalty)
      setPhase('done')
      emit('booking_completed', {
        ...ctx,
        userId: a.userId,
        rentalId: r.data?.id ?? null,
        value: (pricing?.total ?? rentalPrice(rentalPick.head, rentalUnits) ?? 0) / 100,
        currency: 'PLN',
      })
      return
    }
    if (reward && recoverRewardCreate(r, reward, retried, (next) => void reserveRental(a, next.quote, next, true))) return
    // A whitelist refusal has no screen of its own here: like any other rental
    // refusal it is named on the calendar (the last branch below).
    const failure = classifyWriteFailure(r)
    if (failure === 'price_changed') {
      setQuote(r.pricing!)
      setPriceChanged(true)
      setPhase('confirming')
      return
    }
    if (failure === 'verification') {
      setAuth(null)
      setIdentifyErr('Potwierdź numer telefonu, aby dokończyć rezerwację.')
      setPhase('identify')
      emit('booking_failed', { ...ctx, code: r.code, reason: 'verification_required' })
      return
    }
    if (failure === 'channel_closed') {
      closeChannel('rentals', r.code, ctx)
      return
    }
    if (failure === 'network') {
      setBookingErr('Brak połączenia. Spróbuj ponownie.')
      emit('booking_failed', { ...ctx, code: r.code, reason: 'network' })
      return
    }
    // Back to the time step with the reason named: the window is what has to change.
    setBookingErr(rentalErrorMessage(r.code))
    setSlotKey('')
    setRentalRangeOk(null)
    setRefetch((x) => x + 1)
    setStepId('rentalTime')
    setPhase('select')
    emit('booking_failed', { ...ctx, code: r.code, reason: 'rental_refused' })
  }

  // ---- restaurant tables: summary, create, waitlist (#903 F11) ----
  const tableZoneName = tableZoneId != null ? tableOptions?.zones.find((z) => z.id === tableZoneId)?.name ?? null : null
  const tablePartyValue = `${tablePartyLabel(guests)}${tableChildren > 0 ? `, ${childrenLine(tableChildren)}` : ''}`
  const tableDayLabel = date ? (() => { const f = fullDate(date); return f.charAt(0).toUpperCase() + f.slice(1) })() : ''
  // No price row anywhere: a table costs nothing.
  const tableSummaryRows: SummaryRow[] = [
    { label: 'Liczba osób', value: tablePartyValue },
    ...(tableSlot && date ? [{ label: 'Termin', value: `${tableDayLabel}, godz. ${tableSlot.time}` }] : []),
    ...(tableDay ? [{ label: 'Czas przy stoliku', value: formatDuration(tableDay.durationMinutes) }] : []),
    { label: 'Stolik', value: tableZoneName ? `Lokal dobierze stolik, strefa: ${tableZoneName}` : 'Lokal dobierze stolik' },
  ]
  const tableWaitlistSummary: SummaryRow[] = [
    { label: 'Lista oczekujących', value: tableDayLabel },
    { label: 'Liczba osób', value: tablePartyValue },
    ...(tableZoneName ? [{ label: 'Strefa', value: tableZoneName }] : []),
  ]
  // Event context of a table reservation. No PII, as everywhere.
  const tableCtx = () => ({
    table: true,
    businessId: business.id,
    partySize: guests,
    adults: tableAdults,
    children: tableChildren,
    zoneId: tableZoneId,
    date,
    time: tableSlot?.time ?? '',
    startAt: tableSlot?.startAt ?? '',
  })

  /**
   * The API says the business is out of the tables pilot (404 TABLES_NOT_AVAILABLE):
   * drop the family and send the customer back to the fork, or keep the step with an
   * explanation when the table was all this business offered.
   */
  function dropTables() {
    setTableGone(true)
    setTableSlot(null)
    setTableDay(null)
    const others = kinds.filter((k) => k !== 'table')
    if (others.length === 0) return
    setKind(null)
    setStepId(others.length > 1 ? 'offering' : firstStepOf(others[0]!))
  }

  /**
   * Reserve a table - the fourth create path, a sibling of reserveRental(). What it
   * shares is the envelope (site key, Bearer, bookedById, Idempotency-Key, the "verify
   * your phone" detour); the refusals are its own and lead back to the hours.
   */
  async function reserveTable(a: Auth) {
    if (!tableSlot || booking.current) return
    booking.current = true
    setBookingErr('')
    setTableNotice(null)
    setPriceChanged(false)
    setPhase('confirming')
    const ctx = tableCtx()
    emit('booking_submitted', { ...ctx, userId: a.userId })
    const r = await createTableReservation(
      cfg,
      {
        bookedById: a.userId,
        startAt: tableSlot.startAt,
        adults: tableAdults,
        children: tableChildren,
        zoneId: tableZoneId,
        notes: notes.trim() || undefined,
        idempotencyKey: tableIdempotencyKey({
          businessId: business.id,
          startAt: tableSlot.startAt,
          adults: tableAdults,
          children: tableChildren,
          zoneId: tableZoneId,
          userId: a.userId,
        }),
      },
      a.token,
    )
    booking.current = false
    if (r.ok) {
      setBookedStatus(r.data?.status ?? 'confirmed')
      setPhase('done')
      emit('booking_completed', { ...ctx, userId: a.userId, appointmentId: r.data?.id ?? null, value: 0, currency: 'PLN' })
      return
    }
    if (r.code === 'BOOKED_BY_MISMATCH' || r.code === 'VERIFICATION_REQUIRED' || r.code === 'PHONE_VERIFICATION_REQUIRED') {
      setAuth(null)
      setIdentifyErr('Potwierdź numer telefonu, aby dokończyć rezerwację.')
      setPhase('identify')
      emit('booking_failed', { ...ctx, code: r.code, reason: 'verification_required' })
      return
    }
    if (r.code === 'BOOKING_ACCESS_RESTRICTED') {
      setPhase('restricted')
      emit('booking_access_denied', { userId: a.userId, serviceId: null, stage: 'create', table: true })
      emit('booking_failed', { ...ctx, code: r.code, reason: 'access_restricted' })
      return
    }
    // The venue stopped taking bookings in this channel after the page loaded (#680):
    // the closed state, never "pick another hour". A table books under `book`.
    if (classifyWriteFailure(r) === 'channel_closed') {
      closeChannel('book', r.code, ctx)
      return
    }
    if (r.code === 'NETWORK') {
      setBookingErr('Brak połączenia. Spróbuj ponownie.')
      emit('booking_failed', { ...ctx, code: r.code, reason: 'network' })
      return
    }
    if (r.code === 'TABLES_NOT_AVAILABLE') {
      setPhase('select')
      dropTables()
      emit('booking_failed', { ...ctx, code: r.code, reason: 'table_refused' })
      return
    }
    // A zone the venue closed meanwhile: back to "any zone" (and fresh options).
    if (r.code === 'TABLE_ZONE_NOT_FOUND') {
      setTableZoneId(null)
      setTableOptions(undefined)
    }
    // Back to the hours with the reason named: the hour is what has to change.
    setBookingErr(tableErrorMessage(r.code, r.message))
    setTableSlot(null)
    setRefetch((x) => x + 1)
    setStepId('tableTime')
    setPhase('select')
    const gone = TABLE_SLOT_GONE.has(r.code)
    if (gone) emit('slot_lost', { ...ctx, code: r.code })
    emit('booking_failed', { ...ctx, code: r.code, reason: gone ? 'slot_lost' : 'table_refused' })
  }

  /** "Powiadom mnie" on an empty day: one day, no time window, no form. */
  function startTableWaitlist() {
    if (!date) return
    setIntent('waitlist')
    setTableWl(true)
    setTableNotice(null)
    setBookingErr('')
    emit('waitlist_started', { table: true, partySize: guests, zoneId: tableZoneId, date })
    if (auth) void submitTableWaitlist(auth)
    else {
      emit('details_started', { table: true, waitlist: true, partySize: guests, zoneId: tableZoneId })
      setPhase('identify')
    }
  }

  async function submitTableWaitlist(a: Auth) {
    if (!date || wlBusy) return
    setWlBusy(true)
    const ctx = { table: true, partySize: guests, zoneId: tableZoneId, dateFrom: date, dateTo: date }
    const r = await joinTableWaitlist(cfg, { bookedById: a.userId, dateFrom: date, dateTo: date, partySize: guests, zoneId: tableZoneId }, a.token)
    setWlBusy(false)
    if (r.ok) {
      setPhase('waitlistDone')
      emit('waitlist_joined', ctx)
      return
    }
    emit('waitlist_failed', { ...ctx, code: r.code })
    if (r.code === 'BOOKED_BY_MISMATCH' || r.code === 'VERIFICATION_REQUIRED' || r.code === 'PHONE_VERIFICATION_REQUIRED') {
      setAuth(null)
      setIdentifyErr('Potwierdź numer telefonu, aby zapisać się na listę.')
      setPhase('identify')
      return
    }
    // The waitlist (or the whole channel) closed after the page loaded (#680).
    if (classifyWriteFailure(r) === 'channel_closed') {
      closeChannel('waitlist', r.code, ctx)
      return
    }
    // Every other answer ends the sign-up and leaves the customer on the hours.
    setIntent('book')
    setTableWl(false)
    setStepId('tableTime')
    setPhase('select')
    if (r.code === 'WAITLIST_SLOTS_AVAILABLE') {
      // A table came free meanwhile: show that day's hours instead of a pointless sign-up.
      const freeDay = typeof r.details?.date === 'string' ? r.details.date : date
      setDate(freeDay)
      setTableSlot(null)
      setRefetch((x) => x + 1)
      setTableNotice({ title: 'Wolny stolik', text: 'W tym dniu zwolnił się stolik. Wybierz godzinę.' })
      return
    }
    setTableNotice({ title: 'Lista oczekujących', text: tableWaitlistErrorMessage(r.code) })
  }

  /**
   * Summary of a class sign-up. Different rows, not a reshaped visit summary:
   * there is no provider CHOICE to report (the instructor is an attribute of the
   * term) and no cart to total up.
   */
  const classSummaryRows: SummaryRow[] = classPick
    ? [
        { label: 'Zajęcia', value: classPick.service.name },
        ...(chosenSession
          ? [
              {
                label: 'Termin',
                value: `${dayMonth(chosenSession.dateLocal)}, ${sessionHour(chosenSession.startDate, business.timezone)}`,
              },
            ]
          : []),
        ...(chosenSession?.instructor?.name ? [{ label: 'Prowadzi', value: chosenSession.instructor.name }] : []),
        ...((): SummaryRow[] => {
          if (quote?.advertised) return []
          if (quote?.total != null) return [{ label: 'Cena', value: priceLabel(quote.total), total: true }]
          const promo = chosenSession?.promo
          if (!promo) return [{ label: 'Cena', value: priceLabel(chosenSession?.priceOverride ?? classPick.service.price), total: true }]
          return [{
            label: 'Cena',
            value: formatPrice2(promo.price),
            total: true,
            priorValue: promo.advertised && promo.priorPrice != null ? formatPrice2(promo.priorPrice) : null,
            badge: promo.advertised ? promo.badge : null,
            lowestPrice: promo.advertised ? promo.priorPrice : null,
          }]
        })(),
      ]
    : []

  // Summary shown on the identify step when the intent is a waitlist sign-up
  // (no fixed time/price yet - just the service, specialist and date range).
  const waitlistSummary: SummaryRow[] = lines.length === 1
    ? [
        { label: 'Usługa', value: lines[0]!.service.name },
        { label: providerRowLabel, value: providerName },
        {
          label: 'Zakres',
          value: wlPrefs
            ? `od ${dayMonth(addDays(date, wlPrefs.startOffset))} · ${wlPrefs.rangeDays} ${wlPrefs.rangeDays === 1 ? 'dzień' : 'dni'}`
            : dayMonth(date),
        },
      ]
    : []

  // Refining "Dowolny" to a person AFTER the hour is picked: no earlier, because
  // only then do we know who is actually free. Gated to a single staff position -
  // one pick cannot describe a chain, and a pool has its own step.
  const slotPicker = useMemo(() => {
    if (lines.length !== 1 || !anyChosen || isUnit || providerAuto) return null
    if (!slotKey || !chain?.slotCandidates) return null
    const ids = chain.slotCandidates[slotKey]?.[0] ?? []
    const line = lines[0]!
    const candidates = ids
      .map((id) => workers.find((w) => w.id === id))
      .filter((w): w is Resource => !!w && w.isCustomerSelectable !== false)
      .map((w) => ({
        id: w.id,
        name: w.name,
        price: formatPrice2(configuredTotals(line.service, line.variantDuration, line.addonIds, w.id).price),
      }))
    // Nothing to choose from when everyone charges the same - the pick would add
    // a decision without adding information.
    const prices = new Set(candidates.map((c) => c.price))
    if (candidates.length < 2 || prices.size < 2) return null
    return {
      candidates,
      selectedId: typeof line.resourceId === 'number' ? line.resourceId : null,
      onPick: (id: number | null) => {
        // Keep the slot: the person came FROM this slot's free list, and
        // anyChosen stays up so availability is not narrowed behind the choice.
        setLines((prev) => setAllItemResources(prev, id))
        if (id != null) emit('specialist_selected', { ...resourceEvent(id), atSlot: true })
      },
    }
  }, [lines, anyChosen, isUnit, providerAuto, slotKey, chain, workers])

  /** Drop a slot-scoped specialist pick, back to cart-wide "Bez preferencji". */
  function clearSlotPin() {
    if (anyChosen && lines.some((l) => typeof l.resourceId === 'number')) {
      setLines((prev) => setAllItemResources(prev, null))
    }
  }

  async function findNextFree() {
    if (!lines.length || findingNext) return
    setFindingNext(true)
    // The sweep is slow (60 days server-side); if the cart changed meanwhile, the
    // answer describes a visit that no longer exists - drop it.
    const forCart = cartKey
    const hit = await getCartFirstFree(cfg, { items: buildCartItems({ forAvailability: true }), from: date || undefined, bookedById: auth?.userId, token: auth?.token })
    setFindingNext(false)
    if (forCart !== cartKey) return
    if (hit === 'error') return
    if (hit) {
      setDate(hit.date)
      setSlotKey('')
      clearSlotPin()
    } else {
      setNoneAhead(true)
    }
  }

  // The picked start turned into a per-position plan. itemTimes comes from the
  // server (the widget never computes the chain itself), so what we show is what
  // the engine planned.
  const chainPlan = useMemo(() => {
    if (!chain || !slotKey || !date || lines.length < 2) return null
    // Offsets are minutes from the chain start; shifting the UTC slot key by them
    // and formatting through the shared helper keeps one timezone code path.
    const [hh, mm] = slotKey.split(':').map(Number)
    const shifted = (mins: number) => {
      const total = (hh ?? 0) * 60 + (mm ?? 0) + mins
      return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
    }
    return {
      rows: chain.itemTimes.map((it) => ({
        time: slotLabel(date, shifted(it.startOffsetMinutes), business.timezone),
        name: lines[it.itemIndex]?.service.name ?? '',
        duration: formatDuration(it.durationMinutes),
      })),
      total: formatDuration(chain.totalMinutes),
    }
  }, [chain, slotKey, date, lines, business.timezone])

  /**
   * Plakietki pod pozycją koszyka: najpierw wariant z własną ceną, potem każdy
   * dodatek z dopłatą - dokładnie jak stopka wybranej karty w kreatorze WEB.
   */
  const lineChips = (l: CartLine): CartChip[] => {
    const variant = resolveVariant(l.service, l.variantDuration)
    const hasVariantChoice = (l.service.durationOptions?.length ?? 0) > 0
    return [
      ...(hasVariantChoice && variant
        ? [{
            label: variant.label || formatDuration(variant.durationMinutes),
            extra: variant.priceCents != null ? formatPrice2(variant.priceCents) : undefined,
            clock: true,
          }]
        : []),
      ...selectedAddons(l.service, l.addonIds).map((a) => ({
        label: a.name,
        extra: a.price > 0 ? `+${formatPrice2(a.price)}` : undefined,
      })),
    ]
  }

  // Nobody performs the whole cart alone: the step says so and names who does
  // what, instead of leaving "Dowolny" as an unexplained only option (parytet z WEB).
  const noSoloCandidate = lines.length > 1 && !isUnit && offeringWorkers.length === 0
  const performersByService = useMemo(
    () => lines.map((l) => ({
      serviceName: l.service.name,
      // The ENGINE's candidates (every worker performing it), not just the
      // customer-selectable ones - the server is what assigns here.
      names: workers.filter((w) => workerOffersService(l.service, w.id)).map((w) => w.name),
    })),
    [lines, workers],
  )

  // Waitlist v1 is keyed on ONE businessServiceId and carries no duration, so a
  // chain, an add-on or a longer variant would make us notify about a slot the
  // visit does not fit (ta sama brama co w WEB i CLIENT).
  const waitlistLine = lines.length === 1 ? lines[0]! : null
  const canWaitlist = business.waitlistEnabled !== false
    && allows('waitlist')
    && !!waitlistLine
    && waitlistLine.addonIds.length === 0
    && !isUnit
    && (() => {
      const def = resolveVariant(waitlistLine.service, null)
      const cur = resolveVariant(waitlistLine.service, waitlistLine.variantDuration)
      return !cur || !def || cur.durationMinutes === def.durationMinutes
    })()

  async function book(a: Auth, key = slotKey, pricing: PriceQuote | null = quote, reward: ChosenReward | null = null, retried = false) {
    if (!lines.length || !date || !key || booking.current) return
    booking.current = true
    setBookingErr('')
    setPriceChanged(false)
    setRewardRepriced(null)
    setActiveReward(reward)
    setPhase('confirming')
    const ctx = bookingCtx(key)
    emit('booking_submitted', { ...ctx, userId: a.userId })
    const items = buildCartItems()
    const startDate = slotStartDate(date, key, business.timezone || 'Europe/Warsaw')
    const trimmedNotes = notes.trim() || undefined
    const loyaltyRead = readDoneLoyalty(a)
    const r = await createAppointment(
      cfg,
      {
        items,
        startDate,
        bookedById: a.userId,
        notes: trimmedNotes,
        ...expectedTotalOf(pricing, reward),
        idempotencyKey: withRewardKey(
          bookingIdempotencyKey({ businessId: business.id, startDate, items, bookedById: a.userId, notes: trimmedNotes }),
          reward?.fields.rewardSelection.rewardId,
        ),
        reward: reward?.fields ?? null,
      },
      a.token,
    )
    booking.current = false
    if (r.ok) {
      const loyalty = await doneLoyaltyOf(loyaltyRead)
      setBookedStatus(r.data?.status ?? null)
      setUsedReward(reward)
      setDoneLoyalty(loyalty)
      setPhase('done')
      emit('booking_completed', {
        ...ctx,
        userId: a.userId,
        appointmentId: r.data?.id ?? null,
        // GA4-ecommerce convenience: value in major units (PLN), price is grosze.
        value: (pricing?.total ?? selectedPrice) / 100,
        currency: 'PLN',
      })
      return
    }
    // A reward refusal first: classified as an ordinary failure it reads as a lost slot.
    if (reward && recoverRewardCreate(r, reward, retried, (next) => void book(a, key, next.quote, next, true))) return
    switch (classifyWriteFailure(r)) {
      case 'price_changed':
        setQuote(r.pricing!)
        setPriceChanged(true)
        setPhase('confirming')
        return
      // PHONE_VERIFICATION_REQUIRED: the account's phoneVerified flag dropped
      // after the session was minted (e.g. a number change in the app) - the
      // widget's own OTP re-login is exactly the verification the API wants.
      case 'verification':
        setAuth(null)
        setIdentifyErr('Potwierdź numer telefonu, aby dokończyć rezerwację.')
        setPhase('identify')
        emit('booking_failed', { ...ctx, code: r.code, reason: 'verification_required' })
        return
      case 'access_restricted':
        // Backstop: the server-side whitelist gate refused the write (the probe
        // failed open or access changed mid-flow). Same screen as the soft check.
        setPhase('restricted')
        emit('booking_access_denied', { userId: a.userId, serviceId: lines[0]?.service.id ?? null, stage: 'create' })
        emit('booking_failed', { ...ctx, code: r.code, reason: 'access_restricted' })
        return
      // The business stopped taking visits in this channel after the page loaded:
      // a decision, not a race, so never "pick another term".
      case 'channel_closed':
        closeChannel('book', r.code, ctx)
        return
      case 'network':
        setBookingErr('Brak połączenia. Spróbuj ponownie.')
        emit('booking_failed', { ...ctx, code: r.code, reason: 'network' })
        return
      case 'refused':
        setSlotKey('')
        setPhase('slotLost')
        emit('slot_lost', { ...ctx, code: r.code })
        emit('booking_failed', { ...ctx, code: r.code, reason: 'slot_lost' })
    }
  }

  /**
   * Sign up for a term - the class twin of book().
   *
   * Kept separate rather than branching inside book(): the payload, the failure
   * codes and the success shape genuinely differ (there is no slot to lose, no
   * chain to rebuild, and a full term is a normal outcome, not a race). What IS
   * shared is the envelope - identity, Idempotency-Key, the "verify your phone"
   * recovery and the whitelist backstop - so those read the same in both.
   */
  async function register(a: Auth, id: number, pricing: PriceQuote | null = quote, reward: ChosenReward | null = null, retried = false) {
    if (!id || booking.current) return
    booking.current = true
    setBookingErr('')
    setPriceChanged(false)
    setRewardRepriced(null)
    setActiveReward(reward)
    setPhase('confirming')
    const ctx = { groupClassId: classPick?.cls.id ?? null, sessionId: id, businessId: business.id }
    emit('booking_submitted', { ...ctx, userId: a.userId })
    const trimmedNotes = notes.trim() || undefined
    const loyaltyRead = readDoneLoyalty(a)
    const r = await registerForSession(
      cfg,
      {
        sessionId: id,
        bookedById: a.userId,
        notes: trimmedNotes,
        ...classExpectedTotalOf(pricing, chosenSession?.promo?.price, reward),
        // Deterministic from the payload, like the appointment key: it must survive
        // a remount and the phone-verification detour without minting a new one.
        idempotencyKey: withRewardKey(`vzw-gc-${business.id}-${id}-${a.userId}-${(trimmedNotes ?? '').length}`, reward?.fields.rewardSelection.rewardId),
        reward: reward?.fields ?? null,
      },
      a.token,
    )
    booking.current = false
    if (r.ok) {
      const loyalty = await doneLoyaltyOf(loyaltyRead)
      setBookedStatus(r.data?.status ?? 'registered')
      setUsedReward(reward)
      setDoneLoyalty(loyalty)
      setPhase('done')
      emit('booking_completed', {
        ...ctx,
        userId: a.userId,
        attendeeId: r.data?.id ?? null,
        value: (pricing?.total ?? chosenSession?.promo?.price ?? classPick?.service.price ?? 0) / 100,
        currency: 'PLN',
      })
      return
    }
    if (reward && recoverRewardCreate(r, reward, retried, (next) => void register(a, id, next.quote, next, true))) return
    const failure = classifyWriteFailure(r)
    if (failure === 'price_changed') {
      setQuote(r.pricing!)
      setPriceChanged(true)
      setPhase('confirming')
      return
    }
    if (failure === 'verification') {
      setAuth(null)
      setIdentifyErr('Potwierdź numer telefonu, aby dokończyć zapis.')
      setPhase('identify')
      emit('booking_failed', { ...ctx, code: r.code, reason: 'verification_required' })
      return
    }
    if (failure === 'access_restricted') {
      setPhase('restricted')
      emit('booking_failed', { ...ctx, code: r.code, reason: 'access_restricted' })
      return
    }
    if (failure === 'channel_closed') {
      closeChannel('groupClasses', r.code, ctx)
      return
    }
    if (failure === 'network') {
      setBookingErr('Brak połączenia. Spróbuj ponownie.')
      emit('booking_failed', { ...ctx, code: r.code, reason: 'network' })
      return
    }
    // Everything else is a policy answer about THIS term, so the customer stays on
    // the timetable with the reason spelled out - there is no slot-recovery screen
    // to send them to, and the fix is almost always "pick another term".
    setBookingErr(registerErrorMessage(r.code))
    setSessionId(null)
    timetableReq.current = false
    setSessions(null) // refetch: seat counts moved under us
    setStepId('session')
    setPhase('select')
    emit('booking_failed', { ...ctx, code: r.code, reason: 'register_refused' })
  }

  // Hard whitelist check right after any path that establishes a session (OTP
  // verify, e-mail login, OAuth). Resolves access for the actual user and the
  // selected service; anything but 'bookable' stops before the booking step.
  // Runs while the caller's busy flag is still up, so the button keeps spinning.
  async function ensureBookingAccess(a: Auth): Promise<boolean> {
    const anyLocked = cartServices.some((s) => s.viewerAccess === 'locked')
    const needsCheck = business.bookingAccess?.policy === 'restricted' || anyLocked || calRestricted
    if (!needsCheck) return true
    // EVERY position has to clear the whitelist - one locked service in a chain
    // would otherwise be caught only by the create backstop, after the OTP.
    if (!cartServices.length) {
      const r = await checkBookingAccess(cfg, { bookedById: a.userId }, a.token)
      if (r.viewerCanBook === false) {
        setPhase('restricted')
        emit('booking_access_denied', { userId: a.userId, serviceId: null, stage: 'check' })
        return false
      }
      if (r.viewerCanBook === true) setAccessOk(true)
      setCalRestricted(false)
      return true
    }
    for (const svc of cartServices) {
      const r = await checkBookingAccess(cfg, { bookedById: a.userId, businessServiceId: svc.id }, a.token)
      if (r.serviceAccess !== 'bookable') {
        setPhase('restricted')
        emit('booking_access_denied', { userId: a.userId, serviceId: svc.id, stage: 'check' })
        return false
      }
      if (r.viewerCanBook === true) setAccessOk(true)
    }
    setCalRestricted(false)
    return true
  }

  // ---- loyalty rewards (vizyto #471 F37) ----

  /** The public program, read once per mount; null without an active one. */
  function ensureProgram(): Promise<LoyaltyProgramPublic | null> {
    if (!programReq.current) {
      programReq.current = getLoyaltyProgram(cfg).then((p) => (p && p.status === 'active' ? p : null))
    }
    return programReq.current
  }

  /** The target key of every ordinary quote line, the way the API keys the same positions. */
  function rewardKeysFor(flow: RewardFlow, ordinary: PriceQuote): Array<string | null> {
    if (flow === 'appointment') {
      const cart = lines.map((l) => ({
        businessServiceId: l.service.id,
        // The API books the shortest preset when none is chosen, and keys the line by it.
        variantMinutes: resolveVariant(l.service, l.variantDuration)?.durationMinutes ?? null,
        addons: selectedAddons(l.service, l.addonIds).map(({ id, name }) => ({ id, name })),
      }))
      return appointmentTargetKeys(cart, ordinary.lines)
    }
    if (flow === 'rental') {
      const key = rentalPick ? rentalBaseKey(rentalPick.head) : null
      return ordinary.lines.map((line) => (line.kind === 'rental' ? key : null))
    }
    const groupClassId = classPick?.cls.id ?? chosenSession?.groupClassId ?? null
    return ordinary.lines.map((line) => (line.kind === 'group_class_entry' && groupClassId != null ? classEntryKey(groupClassId) : null))
  }

  /** The quote request a reward is priced on: the same cart, window or term the create books. */
  function rewardQuoteTarget(flow: RewardFlow, a: Auth): RewardQuoteTarget | null {
    if (flow === 'appointment') {
      if (!lines.length || !date || !slotKey) return null
      return {
        flow,
        payload: { items: buildCartItems(), startDate: slotStartDate(date, slotKey, business.timezone || 'Europe/Warsaw'), bookedById: a.userId },
      }
    }
    if (flow === 'rental') {
      const win = rentalPick ? rentalWindow(rentalPick, date, rentalUnits, slotKey, business, rentalSlots) : null
      if (!rentalPick || !win) return null
      return {
        flow,
        payload: {
          ...rentalTarget(rentalPick),
          ...win,
          partySize: rentalPick.head.rentalMaxPartySize != null ? rentalParty : null,
          bookedById: a.userId,
        },
      }
    }
    return chosenSession ? { flow: 'class', sessionId: chosenSession.id } : null
  }

  const choiceOf = (s: RewardOffer) => deriveRewardChoice({ ...s, ordinaryTotal: s.ordinary.total })

  /**
   * Price every usable reward that has no answer for its current lines, in
   * parallel. A line conflict refuses the named lines and the next round asks
   * again without them (bounded: each round refuses at least one more line).
   */
  async function priceRewards(gen: number) {
    for (let round = 0; round < 3; round++) {
      const s = offerRef.current
      if (!s || s.gen !== gen) return
      const todo = choiceOf(s).toPrice
      if (!todo.length) return
      const target = rewardQuoteTarget(s.flow, s.auth)
      if (!target) return
      const loading = { ...s.quotes }
      for (const t of todo) loading[t.rewardId] = { status: 'loading', key: selectionKey(t.lineIndexes) }
      setOffer({ ...s, quotes: loading })
      const results = await Promise.all(todo.map((t) => quoteWithReward(cfg, target, t, s.auth.token)))
      const now = offerRef.current
      if (!now || now.gen !== gen) return
      setOffer({ ...now, ...applyRewardQuotes(now, todo, results) })
    }
  }

  /**
   * Called where the flow books: reads the customer's card, rewards and the
   * catalog, prices what fits this booking, and shows the "Nagroda" step when a
   * reward can be used or claimed. False = book exactly as before, at the
   * ordinary price, with no extra step: no program, no card, no quote, a free
   * booking, nothing to offer, a read that did not answer in time, or an answer
   * the step cannot be built from. Never throws: the caller books on false.
   */
  async function offerReward(a: Auth, ordinary: PriceQuote | null, flow: RewardFlow): Promise<boolean> {
    if (!a.token || !ordinary || !ordinary.lines.length || ordinary.total === 0) return false
    // The select step goes away before the first read, as it did at the tap before
    // loyalty: a term tapped while the program loads cannot change this booking.
    setBookingErr('')
    setPriceChanged(false)
    setRewardChecking(true)
    setPhase('confirming')
    try {
      // Every read is bounded: this spinner has no way back (src/loyalty.ts).
      const inputs = await readRewardInputs({
        program: ensureProgram,
        wallet: () => getMyLoyalty(cfg, a.token),
        owned: () => getMyLoyaltyRewards(cfg, a.token),
        catalog: () => getLoyaltyCatalog(cfg),
      })
      if (!inputs) return false
      const gen = ++offerGen.current
      setOffer({
        gen, flow, auth: a, ...inputs, ordinary,
        lines: bookingRewardLines(ordinary.lines, rewardKeysFor(flow, ordinary)),
        refused: {},
        quotes: {},
      })
      // The rounds share one wait (a throw in them reads as no answer). Without
      // an answer the offer goes, so a round that answers late finds no offer of
      // its generation and stops (priceRewards).
      const priced = await settleWithin(priceRewards(gen).then(() => true), REWARD_READ_WAIT_MS)
      const s = offerRef.current
      if (!s || s.gen !== gen) return false
      if (!priced) {
        setOffer(null)
        return false
      }
      const view = choiceOf(s)
      if (!view.usable.length && !view.claimable.length) {
        setOffer(null)
        return false
      }
      setRewardChoice(null)
      preferredReward.current = null
      claimFocus.current = false
      setRewardFocus(null)
      setRewardNotice(null)
      setClaim(null)
      setClaimErr('')
      setPhase('reward')
      return true
    } catch {
      // An answer the step cannot be built from (an API shape it does not know) is
      // no step: the booking goes on at the ordinary price, as without a program.
      setOffer(null)
      return false
    } finally {
      setRewardChecking(false)
    }
  }

  /** A customer already known (a session from the host page, or the same session again). */
  async function startAuthenticated(a: Auth, flow: 'appointment' | 'rental') {
    if (offering.current) return
    offering.current = true
    try {
      if (await offerReward(a, quote, flow)) return
    } finally {
      offering.current = false
    }
    if (flow === 'rental') void reserveRental(a)
    else void book(a, slotKey)
  }

  /**
   * Back on the step with fresh inputs after a refused create: the choice is
   * dropped, the card and its rewards are read again (a reward may be gone), and
   * every reward is priced anew.
   */
  async function reoffer(s: RewardOffer, notice: RewardNotice, patch: { ordinary?: PriceQuote | null; refused?: Record<number, number[]> } = {}) {
    const gen = ++offerGen.current
    const ordinary = patch.ordinary ?? s.ordinary
    setRewardChoice(null)
    preferredReward.current = null
    claimFocus.current = false
    setRewardFocus(null)
    setClaim(null)
    setClaimErr('')
    setRewardNotice(notice)
    setOffer({
      ...s,
      gen,
      ordinary,
      lines: patch.ordinary ? bookingRewardLines(ordinary.lines, rewardKeysFor(s.flow, ordinary)) : s.lines,
      refused: patch.refused ?? s.refused,
      quotes: {},
    })
    setPhase('reward')
    const [wallet, owned] = await Promise.all([getMyLoyalty(cfg, s.auth.token), getMyLoyaltyRewards(cfg, s.auth.token)])
    const now = offerRef.current
    if (!now || now.gen !== gen) return
    setOffer({ ...now, wallet: wallet ?? now.wallet, owned })
    await priceRewards(gen)
  }

  /**
   * A create with a reward was refused: recover BEFORE the ordinary failure
   * classification, which would read every reward code as a lost slot. True =
   * handled. The shared provider's rules and words, in the step instead of toasts.
   */
  function recoverRewardCreate(
    r: Extract<BookingWriteResult, { ok: false }>,
    reward: ChosenReward,
    retried: boolean,
    retry: (next: ChosenReward) => void,
  ): boolean {
    const action = rewardCreateAction(r.code, hasRewardPricing(r.pricing))
    if (!action) return false
    const s = offerRef.current
    const selection = reward.fields.rewardSelection
    if (action === 'fresh_quote' && hasRewardPricing(r.pricing)) {
      // The token lived five minutes or a price moved: the answer carries a fresh reward quote.
      const pricing = r.pricing
      const next: ChosenReward = { ...reward, quote: pricing, fields: { ...reward.fields, pricingToken: pricing.pricingToken } }
      if (s) setOffer({ ...s, quotes: { ...s.quotes, [selection.rewardId]: { status: 'ok', key: selectionKey(selection.lineIndexes), quote: pricing } } })
      if (!retried && pricing.total === reward.quote.total) {
        retry(next)
        return true
      }
      setActiveReward(next)
      setRewardRepriced(next)
      setPhase('confirming')
      return true
    }
    setActiveReward(null)
    if (!s) return false
    // A refusal's quote is the ordinary one (no reward in it): "Bez nagrody" books with it.
    const ordinary = r.pricing && !r.pricing.reward ? r.pricing : null
    if (action === 'price_changed') void reoffer(s, REWARD_RECOVERY.priceChanged, { ordinary })
    else if (action === 'conflict') void reoffer(s, REWARD_RECOVERY.conflict, { ordinary, refused: refuseLines(s.refused, selection.rewardId, r.lineIndexes ?? []) })
    else if (action === 'unavailable') void reoffer(s, REWARD_RECOVERY.unavailable)
    else void reoffer(s, { title: refusalMessage(r.message, r.code), text: '' })
    return true
  }

  /** "Rezerwuję" on the step: the chosen reward with its quote, or the ordinary price. */
  function confirmReward() {
    const s = offerRef.current
    if (!s || rewardPending || claimBusy) return
    const item = chosenReward
    const quoteOk = item?.quote?.status === 'ok' ? item.quote.quote : null
    const reward: ChosenReward | null = item && quoteOk?.pricingToken
      ? {
          fields: {
            rewardSelection: { rewardId: item.reward.id, lineIndexes: item.verdict.lineIndexes },
            discountChoice: 'reward',
            pricingToken: quoteOk.pricingToken,
          },
          name: item.reward.termsSnapshot.name,
          quote: quoteOk,
        }
      : null
    setRewardNotice(null)
    setClaim(null)
    bookWithReward(s, reward)
  }

  function bookWithReward(s: RewardOffer, reward: ChosenReward | null) {
    const pricing = reward ? reward.quote : s.ordinary
    // "Bez nagrody" books at the price the step showed; the receipt says the same.
    if (!reward) setQuote(s.ordinary)
    if (s.flow === 'appointment') void book(s.auth, slotKey, pricing, reward)
    else if (s.flow === 'rental') void reserveRental(s.auth, pricing, reward)
    else if (chosenSession) void register(s.auth, chosenSession.id, pricing, reward)
  }

  /** "Spróbuj ponownie" under a reward whose price could not be read. */
  function retryRewardPrice(rewardId: number) {
    const s = offerRef.current
    if (!s) return
    const quotes = { ...s.quotes }
    delete quotes[rewardId]
    setOffer({ ...s, quotes })
    // The link goes with the failure; the card, enabled while it loads, takes focus.
    setRewardFocus({ to: 'reward', id: rewardId })
    void priceRewards(s.gen)
  }

  function openClaim(item: ClaimableReward) {
    setClaimErr('')
    // One key per opened confirmation: a double tap or a retry claims once.
    setClaim({ item, key: newClaimKey() })
  }

  async function confirmClaim() {
    const s = offerRef.current
    if (!s || !claim || claimBusy) return
    setClaimBusy(true)
    setClaimErr('')
    const { item, key } = claim
    const r = await claimLoyaltyReward(cfg, { catalogId: item.catalog.id, idempotencyKey: key, pointsCost: item.cost, targetKey: item.targetKey }, s.auth.token)
    // Chosen as soon as it is priced (set before the reread, like the shared sheet).
    if (r.ok) {
      preferredReward.current = r.rewardId
      claimFocus.current = true
    }
    const [wallet, owned] = await Promise.all([getMyLoyalty(cfg, s.auth.token), getMyLoyaltyRewards(cfg, s.auth.token)])
    setClaimBusy(false)
    const now = offerRef.current
    if (!now || now.gen !== s.gen) return
    if (r.ok) setClaim(null)
    else {
      setClaimErr(claimErrorMessage(r.code, r.message))
      if (CLAIM_CLOSES.has(r.code)) {
        setClaim(null)
        // Back on the entry's own "Odbierz" (the heading when the reread took it away).
        setRewardFocus({ to: 'claim', id: item.catalog.id })
      }
    }
    // A reread that failed keeps what the step had; a claimed reward the reread
    // does not list yet is added from the catalog entry it came from.
    let list = owned.length ? owned : now.owned
    if (r.ok && !list.some((x) => x.id === r.rewardId)) {
      list = [...list, { id: r.rewardId, catalogId: item.catalog.id, status: 'available', expiresAt: null, termsSnapshot: claimedTerms(item.catalog, item.targetKey) }]
    }
    setOffer({ ...now, wallet: wallet ?? now.wallet, owned: list })
    await priceRewards(now.gen)
  }

  /**
   * The success screen's program block: the program, the card when there is one
   * and, for a stamp card, the catalog that names its reward. Started next to the
   * create and awaited before the screen (doneLoyaltyOf), so the block renders
   * whole on the first frame and never grows under the customer's thumb
   * (DESIGN.md 4.6.1). A booking does not move the card (staff award at
   * settlement, a reward was paid for when claimed), so reading it alongside the
   * create shows the same card as after it. Null without an active program: no
   * further read.
   */
  async function readDoneLoyalty(a: Auth): Promise<DoneLoyalty | null> {
    const program = await ensureProgram()
    if (!program) return null
    const catalog = offerRef.current?.catalog ?? []
    const [wallet, stampCatalog] = await Promise.all([
      getMyLoyalty(cfg, a.token),
      isStampProgram(program) && !catalog.length ? getLoyaltyCatalog(cfg) : Promise.resolve(catalog),
    ])
    return { program, wallet, catalog: stampCatalog }
  }

  /** The block for the success screen: read by the time the create answered (or just after), else none. */
  const doneLoyaltyOf = (read: Promise<DoneLoyalty | null>) => settleWithin(read, DONE_LOYALTY_WAIT_MS)

  async function refreshQuoteFor(a: Auth): Promise<PriceQuote | null> {
    let fresh: PriceQuote | null = null
    if (effKind === 'service' && lines.length && date && slotKey) {
      fresh = await quoteAppointment(cfg, {
        items: buildCartItems(),
        startDate: slotStartDate(date, slotKey, business.timezone || 'Europe/Warsaw'),
        bookedById: a.userId,
      }, a.token)
    } else if (effKind === 'rental' && rentalPick) {
      const win = rentalWindow(rentalPick, date, rentalUnits, slotKey, business, rentalSlots)
      if (win) {
        fresh = await quoteRental(cfg, {
          ...rentalTarget(rentalPick),
          ...win,
          partySize: rentalPick.head.rentalMaxPartySize != null ? rentalParty : null,
          bookedById: a.userId,
        }, a.token)
      }
    }
    setQuote(fresh)
    return fresh
  }

  // After authentication, refresh customer-specific pricing before the write.
  // A failed new route returns null and the booking proceeds without
  // expectedTotal, exactly like a widget released before promotions.
  async function complete(a: Auth) {
    if (intent === 'waitlist') void (tableWl ? submitTableWaitlist(a) : submitWaitlist(a))
    else if (effKind === 'table') {
      if (tableSlot) void reserveTable(a)
      else setPhase('select')
    } else if (effKind === 'class') {
      if (chosenSession) void startClassBooking(a, chosenSession.id)
      else setPhase('select')
    } else if (effKind === 'rental') {
      if (rentalReady) {
        const fresh = await refreshQuoteFor(a)
        if (await offerReward(a, fresh, 'rental')) return
        void reserveRental(a, fresh)
      }
      else setPhase('select')
    } else if (lines.length && date && slotKey) {
      const fresh = await refreshQuoteFor(a)
      if (await offerReward(a, fresh, 'appointment')) return
      void book(a, slotKey, fresh)
    }
    else setPhase('select')
  }

  /**
   * A class entry, with a reward step when there is something to offer. The
   * entry's ordinary quote is read only for a business with a program; without
   * one, when the quote fails or either read does not answer in time, the
   * sign-up goes exactly as before.
   */
  async function startClassBooking(a: Auth, id: number) {
    if (offering.current) return
    offering.current = true
    try {
      if (a.token) {
        // Locked before the first read, like offerReward: the program and then the
        // entry's price are read under the same quiet spinner as the card, each
        // bounded like the card's reads (src/loyalty.ts).
        setBookingErr('')
        setPriceChanged(false)
        setRewardChecking(true)
        setPhase('confirming')
        if (await settleWithin(ensureProgram(), PROGRAM_WAIT_MS)) {
          const ordinary = await settleWithin(quoteClassEntry(cfg, id, {}, a.token), REWARD_READ_WAIT_MS)
          if (ordinary && await offerReward(a, ordinary, 'class')) return
        }
      }
    } catch {
      // Whatever failed on the way to the reward step, the sign-up goes on without it.
    } finally {
      offering.current = false
      setRewardChecking(false)
    }
    void register(a, id)
  }

  function retryBooking() {
    if (!auth) return
    // A create with a reward goes again with the same reward and its quote.
    const reward = activeReward
    if (effKind === 'class' && chosenSession) void register(auth, chosenSession.id, reward?.quote ?? quote, reward)
    else if (effKind === 'rental') void reserveRental(auth, reward?.quote ?? quote, reward)
    else if (effKind === 'table') void reserveTable(auth)
    else void book(auth, slotKey, reward?.quote ?? quote, reward)
  }

  const waitlistErrorMsg = (code: string) =>
    code === 'WAITLIST_DUPLICATE'
      ? 'Już czekasz na termin tej usługi w tym zakresie dat.'
      : code === 'WAITLIST_LIMIT_REACHED'
        ? 'Masz już 3 aktywne zapisy - usuń któryś w profilu Vizyto, aby dodać nowy.'
        : code === 'WAITLIST_DISABLED'
          ? 'Ten salon nie prowadzi listy oczekujących.'
          : code === 'WAITLIST_SLOTS_AVAILABLE'
            ? 'W tym zakresie są wolne terminy - wybierz godzinę w kalendarzu.'
            : code === 'INCOMPLETE_PROFILE'
            ? 'Uzupełnij imię, nazwisko i telefon, aby zapisać się na listę.'
            : code === 'NETWORK'
              ? 'Brak połączenia. Spróbuj ponownie.'
              : 'Nie udało się zapisać na listę. Spróbuj ponownie.'

  async function submitWaitlist(a: Auth, prefs = wlPrefs) {
    const service = waitlistLine?.service
    if (!service || !date || !prefs || wlBusy) return
    setWlBusy(true)
    setWlErr('')
    const dateFrom = addDays(date, prefs.startOffset)
    const dateTo = addDays(dateFrom, prefs.rangeDays - 1)
    const r = await joinWaitlist(
      cfg,
      {
        businessServiceId: service.id,
        // "Bez preferencji" signs up for ANY specialist - a pin made for one hour
        // must not narrow a sign-up that is about the service being free at all.
        resourceId: anyChosen ? null : lineWorker(waitlistLine!) ?? null,
        dateFrom,
        dateTo,
        timeFrom: prefs.timeFrom,
        timeTo: prefs.timeTo,
        bookedById: a.userId,
        // Without it the entry is attributed to the client app - the widget is a
        // website sign-up.
        source: 'web',
      },
      a.token,
    )
    setWlBusy(false)
    if (r.ok) {
      setPhase('waitlistDone')
      emit('waitlist_joined', {
        serviceId: service.id,
        serviceName: service.name,
        ...resourceEvent(cartResource ?? 'any'),
        dateFrom,
        dateTo,
        timeFrom: prefs.timeFrom,
        timeTo: prefs.timeTo,
      })
      return
    }
    if (classifyWriteFailure(r) === 'channel_closed') {
      emit('waitlist_failed', { code: r.code })
      closeChannel('waitlist', r.code, { serviceId: service.id })
      return
    }
    setWlErr(waitlistErrorMsg(r.code))
    setPhase('waitlist')
    emit('waitlist_failed', { code: r.code })
  }

  /**
   * A write the API refused under the channel policy (409 CHANNEL_BOOKING_DISABLED
   * / CHANNEL_ACTION_DISABLED): the business switched this off after the page
   * loaded. Remember what is closed now, so the fork and the waitlist stop
   * offering it, and show the closed state - for the whole widget when nothing
   * this business sells is left.
   *
   * The code alone cannot say how much closed (CHANNEL_BOOKING_DISABLED on a
   * visit is both "online booking off" and "the whole channel off"), so the host
   * re-reads the public profile. The fresh `bookingChannels[cfg.channel]` then drives
   * this flow's exits and every later mount (a reopened modal, a new `open()`),
   * instead of offering again what the server will refuse. The closed state on
   * screen stays; it only widens to the whole widget when nothing is left.
   */
  function closeChannel(action: CustomerAction, code: string, ctx: Record<string, unknown>) {
    const nextRefused = [...new Set([...refused, ...refusedActions(action, code)])]
    setRefused(nextRefused)
    const left = soldKinds.filter((k) => publicChannelAllows(business, cfg.channel, KIND_ACTION[k]) && !nextRefused.includes(KIND_ACTION[k]))
    setClosedFor(left.length === 0 ? 'all' : action)
    setBookingErr('')
    setPhase('closed')
    emit('channel_closed', { ...ctx, action, code, stage: 'submit' })
    // The waitlist reports its own failure event (waitlist_failed).
    if (action !== 'waitlist') emit('booking_failed', { ...ctx, code, reason: 'channel_closed' })
    void onChannelRefused?.().then((fresh) => {
      if (!fresh) return
      const open = soldKinds.filter((k) => publicChannelAllows(fresh, cfg.channel, KIND_ACTION[k]) && !nextRefused.includes(KIND_ACTION[k]))
      // Only while the closed state is still on screen (null = the customer left it).
      if (open.length === 0) setClosedFor((c) => (c ? 'all' : c))
    })
  }

  /**
   * The way out of a closed family: the families still open (the fork when there
   * are several), or the calendar when only the waitlist closed. Null when
   * nothing is left - the closed state is then the end of the road.
   */
  const closedExit: { label: string; go: () => void } | null = (() => {
    if (phase !== 'closed' || !closedFor || closedFor === 'all') return null
    if (closedFor === 'waitlist') {
      // The table waitlist leads back to the table hours, the visit one to the calendar.
      const table = tableWl
      if (!kinds.includes(table ? 'table' : 'service')) return null
      return {
        label: 'Wróć do kalendarza',
        go: () => { setIntent('book'); setTableWl(false); setClosedFor(null); setStepId(table ? 'tableTime' : 'time'); setPhase('select') },
      }
    }
    if (kinds.length === 0) return null
    const only = kinds.length === 1 ? kinds[0]! : null
    return {
      label: only === 'service' ? 'Przejdź do wizyt'
        : only === 'class' ? 'Przejdź do zajęć'
          : only === 'rental' ? 'Przejdź do wynajmu'
            : only === 'table' ? 'Przejdź do rezerwacji stolika'
              : 'Wybierz, co zarezerwować',
      go: () => {
        setClosedFor(null)
        setBookingErr('')
        if (only) { setKind(only); setStepId(firstStepOf(only)) }
        else { setKind(null); setStepId('offering') }
        setPhase('select')
      },
    }
  })()
  // `kind`, not effKind: once `book` closes, the table leaves `kinds` and effKind moves on.
  const closedTable = closedFor === 'book' && kind === 'table'

  // Open the waitlist form for the selected service/day. The sign-up needs an
  // authenticated user, which the identify/OTP path supplies at submit time.
  function startWaitlist() {
    setIntent('waitlist')
    setWlErr('')
    emit('waitlist_started', { serviceId: waitlistLine?.service.id, ...resourceEvent(cartResource ?? 'any'), date })
    setPhase('waitlist')
  }

  function onWaitlistFormSubmit(prefs: WaitlistPrefs) {
    setWlPrefs(prefs)
    if (auth) void submitWaitlist(auth, prefs)
    else {
      emit('details_started', { serviceId: waitlistLine?.service.id, waitlist: true })
      setPhase('identify')
    }
  }

  // Resolve a specialist choice to a stable {id,name} shape for event payloads.
  const resourceEvent = (r: ResChoice) =>
    r === 'any'
      ? { resourceId: null, resourceName: anyProviderLabel }
      : { resourceId: r, resourceName: business.resources.find((x) => x.id === r)?.name ?? '' }

  // The full booking context shared by every funnel event past slot selection.
  // Funnel payloads keep the legacy scalar fields (serviceId/serviceName point at
  // the FIRST position, so existing GA4/GTM setups keep working) and gain the
  // cart shape next to them. No PII, jak dotąd.
  const bookingCtx = (key = slotKey) => ({
    serviceId: lines[0]?.service.id,
    serviceName: lines[0]?.service.name,
    serviceIds: lines.map((l) => l.service.id),
    serviceNames: lines.map((l) => l.service.name),
    itemCount: lines.length,
    price: lines.length ? selectedPrice : undefined,
    ...resourceEvent(cartResource ?? 'any'),
    date,
    time: key ? slotLabel(date, key, business.timezone) : '',
    startDate: key ? slotStartDate(date, key, business.timezone || 'Europe/Warsaw') : '',
  })

  // ---- selection (select-then-Dalej) ----
  /**
   * Toggle a service in the cart. A new position inherits the cart-wide answer,
   * but a pinned person who does not perform it loses the pin (jak
   * applyToggleService w WEB) - the chain would dead-end at the time step.
   */
  function toggleService(s: Service) {
    setCartNotice(null)
    const existing = lineOf(s.id)
    if (existing) {
      const next = lines.filter((l) => l.service.id !== s.id)
      setLines(next)
      if (configuringId === s.id) setConfiguringId(null)
      setDate('')
      setSlotKey('')
      emit('service_removed', { serviceId: s.id, serviceName: s.name, itemCount: next.length })
      return
    }
    if (lines.length >= MAX_CART_ITEMS) {
      setCartNotice({ title: 'Limit koszyka', text: `W jednej wizycie możesz połączyć maksymalnie ${MAX_CART_ITEMS} usług.` })
      return
    }
    // Per-position mode never inherits a person onto a service the customer has
    // not looked at yet - "bez preferencji" is the honest default there.
    const inherited = eachMode ? null : typeof cartResource === 'number' ? cartResource : cartResource === 'any' ? null : undefined
    const next = [...lines, newLine(s, inherited)]
    const pickedObject = typeof inherited === 'number'
      ? business.resources.find((r) => r.id === inherited && r.type === 'object')
      : undefined
    if (pickedObject) {
      // A pool object stays valid while EVERY position is a unit service of the
      // same pool - adding a second loża must not discard the picked loża.
      const poolTag = ((pickedObject.categoryTag ?? '') as string).trim() || null
      const stillValid = next.every((l) => l.service.fulfillmentMode === 'unit'
        && (((l.service.primaryObjectCategoryTag ?? '') as string).trim() || null) === poolTag)
      setLines(stillValid ? next : next.map((l) => ({ ...l, resourceId: undefined })))
      if (!stillValid) {
        setAnyChosen(false)
        setCartNotice({
          title: 'Zmienił się skład wizyty',
          text: `${pickedObject.name} nie obsługuje usługi: ${s.name}. Wybierz zasób ponownie.`,
        })
      }
    } else {
      const { items, droppedResourceIds } = dropInvalidPins(next, eachMode ? 'each' : 'single')
      setLines(items)
      if (droppedResourceIds.length) {
        const dropped = droppedResourceIds
          .map((id) => business.resources.find((r) => r.id === id)?.name)
          .filter((n): n is string => !!n)
        if (!eachMode) setAnyChosen(false)
        setCartNotice({
          title: 'Zmienił się skład wizyty',
          // Nazwa usługi po dwukropku - wstawiona w zdanie nie da się odmienić
          // ("nie wykonuje usługi Strzyżenie" zgrzyta po polsku).
          text: dropped.length
            ? `${dropped.join(', ')} nie wykonuje usługi: ${s.name}. Wybierz specjalistę ponownie.`
            : 'Wybierz specjalistę ponownie - zmienił się skład wizyty.',
        })
      }
    }
    setDate('')
    setSlotKey('')
    // A service with variants/add-ons opens its configuration right away.
    if (serviceHasOptions(s)) setConfiguringId(s.id)
    emit('service_selected', { serviceId: s.id, serviceName: s.name, price: s.price, durationMin: s.duration, itemCount: next.length })
  }

  /** Reopen the configuration of a cart position (variant + add-ons). */
  function editLine(serviceId: number) {
    if (lineOf(serviceId)) setConfiguringId(serviceId)
  }

  /** One answer for the WHOLE cart: "Bez preferencji" or one person/object. */
  function pickResource(r: ResChoice) {
    if (r === cartResource && !eachMode) return
    setLines((prev) => setAllItemResources(prev, r === 'any' ? null : r))
    setEachMode(false)
    setAnyChosen(r === 'any')
    setCartNotice(null)
    setDate('')
    setSlotKey('')
    emit('specialist_selected', resourceEvent(r))
  }

  /** Switch to one answer PER position; untouched ones default to "bez preferencji". */
  function pickPerItemMode() {
    setLines((prev) => enterPerItemMode(prev))
    setEachMode(true)
    // The pins are the question now, so availability must follow them (no union).
    setAnyChosen(false)
    setCartNotice(null)
    setDate('')
    setSlotKey('')
    emit('specialist_selected', { resourceId: null, resourceName: 'Wybór per usługa', perService: true })
  }

  /** The answer for ONE position (per-position mode, or the chip on the time step). */
  function pickItemResource(serviceId: number, id: number | null) {
    const next = setItemResource(lines, serviceId, id)
    setLines(next)
    // Answering per position IS the per-position mode. Editing from the chip on
    // the time step used to leave eachMode off, so going back to the specialist
    // step showed the cart-wide list with nothing selected and "Dalej" blocked -
    // the mixed answers were silently unreachable.
    if (getStaffItems(next).length >= 2) setEachMode(true)
    // Union-wide availability only survives while nothing at all is pinned -
    // otherwise the calendar would answer a question nobody asked.
    setAnyChosen(getStaffItems(next).every((l) => l.resourceId == null))
    setCartNotice(null)
    setSlotKey('')
    emit('specialist_selected', { ...resourceEvent(id ?? 'any'), serviceId, perService: true })
  }

  /** "Sprawdź wszystkich specjalistów" - unpin everybody and ask the day again. */
  function checkAllSpecialists() {
    const next = clearStaffPins(lines)
    setLines(next)
    setAnyChosen(next.every((l) => itemResourceId(l) == null))
    setSlotKey('')
    setEmptyProbe(null)
  }
  function pickVariant(durationMinutes: number) {
    if (configuringId == null) return
    setLines((prev) => prev.map((l) => (l.service.id === configuringId ? { ...l, variantDuration: durationMinutes } : l)))
    // The chain length changed - the chosen day/slot may no longer fit.
    setDate('')
    setSlotKey('')
  }
  function toggleAddon(id: number) {
    if (configuringId == null) return
    setLines((prev) => prev.map((l) => (
      l.service.id === configuringId
        ? { ...l, addonIds: l.addonIds.includes(id) ? l.addonIds.filter((x) => x !== id) : [...l.addonIds, id] }
        : l
    )))
    setDate('')
    setSlotKey('')
  }
  function confirmConfigure() {
    const line = configuringLine
    if (line && !addonsValid(line.service, line.addonIds)) return
    setConfiguringId(null)
    if (line) {
      emit('addons_selected', {
        serviceId: line.service.id,
        variantDurationMin: line.variantDuration ?? undefined,
        addonIds: line.addonIds,
        addonCount: line.addonIds.length,
      })
    }
  }
  function dalej() {
    if (stepId === 'offering') {
      // The gate answers itself on tap; "Dalej" is only a fallback for keyboard
      // users who selected without activating.
      if (kind) setStepId(firstStepOf(kind))
      return
    }
    if (stepId === 'tableParty') {
      setStepId('tableTime')
      return
    }
    if (stepId === 'tableTime') {
      if (!tableSlot) return
      setIntent('book')
      setTableWl(false)
      if (auth) void reserveTable(auth)
      else {
        emit('details_started', { table: true, partySize: guests, zoneId: tableZoneId })
        setPhase('identify')
      }
      return
    }
    if (stepId === 'rental') {
      if (!rentalPick) return
      setStepId('rentalTime')
      return
    }
    if (stepId === 'rentalTime') {
      if (!rentalReady || !rentalPick) return
      setIntent('book')
      if (auth) void startAuthenticated(auth, 'rental')
      else {
        emit('details_started', { rental: rentalOptionKey(rentalPick), units: rentalUnits })
        setPhase('identify')
      }
      return
    }
    if (stepId === 'class') {
      if (!classPick) return
      setSessionId(null)
      setStepId('session')
      return
    }
    if (stepId === 'session') {
      if (!chosenSession) return
      setIntent('book')
      if (auth) void startClassBooking(auth, chosenSession.id)
      else {
        emit('details_started', { groupClassId: classPick?.cls.id ?? null, sessionId: chosenSession.id })
        setPhase('identify')
      }
      return
    }
    if (stepId === 'service') {
      if (!cartValid) return
      if (!hasResourceStep) {
        // No pick step: providerSelection 'auto', or 0-1 selectable providers.
        const r: ResChoice = !providerAuto && selectableProviders.length === 1 ? selectableProviders[0]!.id : 'any'
        setLines((prev) => setAllItemResources(prev, r === 'any' ? null : r))
        setEachMode(false)
        setAnyChosen(r === 'any')
        setStepId('time')
        emit('specialist_selected', { ...resourceEvent(r), auto: true })
      } else setStepId('provider')
    } else if (stepId === 'provider') {
      if (!resourceValid) return
      setStepId('time')
    } else {
      if (!slotKey) return
      setIntent('book')
      if (auth) void startAuthenticated(auth, 'appointment')
      else {
        emit('details_started', bookingCtx(slotKey))
        setPhase('identify')
      }
    }
  }

  // ---- loyalty: the step's lists and the program prefetch ----
  // Derived on every render with an offer, the spinner's included: an offer the
  // step cannot read (offerReward then drops it and books) renders nothing
  // instead of throwing in render.
  const rewardView = useMemo(() => {
    if (!offer) return null
    try {
      return choiceOf(offer)
    } catch {
      return null
    }
  }, [offer])
  const chosenReward = rewardChoice != null ? rewardView?.usable.find((u) => u.reward.id === rewardChoice) ?? null : null
  /** A reward is chosen but its price is not known yet: the booking waits. */
  const rewardPending = rewardChoice != null && chosenReward?.quote?.status !== 'ok'
  const serviceNames = useMemo(() => new Map(business.services.map((x) => [x.id, x.name])), [business])

  useEffect(() => {
    if (!rewardView) return
    const preferred = preferredReward.current
    if (preferred != null) {
      const item = rewardView.usable.find((u) => u.reward.id === preferred)
      if (item?.quote?.status === 'ok') {
        preferredReward.current = null
        setRewardChoice(preferred)
        setRewardNotice({ title: 'Nagroda odebrana', text: 'Dodaliśmy ją do tej rezerwacji. Sprawdź cenę i potwierdź.', tone: 'plain' })
        // The claim panel had focus: it moves to the card the claim chose.
        if (claimFocus.current) {
          claimFocus.current = false
          setRewardFocus({ to: 'reward', id: preferred })
        }
        return
      }
      // Priced and still not usable here (it saves nothing, say): it stays on the list as it is.
      const settled = !rewardView.usable.some((u) => !u.quote || u.quote.status === 'loading')
      if (settled && !item) preferredReward.current = null
      // Nothing to choose now (or its price failed): focus waits on the step's heading.
      if (settled && claimFocus.current) {
        claimFocus.current = false
        setRewardFocus({ to: 'heading' })
      }
    }
    // The chosen reward stopped fitting this booking (a refusal, a reread).
    if (rewardChoice != null && !rewardView.usable.some((u) => u.reward.id === rewardChoice)) setRewardChoice(null)
  }, [rewardView])

  // Prefetch the program, without waiting for it, once the customer starts giving
  // their details, so it is there when the code is verified. Never on a select
  // step: an inline embed can open on its last one (a single rentable, a term or
  // service prefill), and a visitor who only looks at it makes no loyalty request.
  // A customer already signed in reads it on "Dalej": under the quiet spinner, or
  // next to the create when there is no price to put a reward on.
  useEffect(() => {
    if (effKind === 'table' || intent !== 'book') return
    if (phase === 'identify') void ensureProgram()
  }, [phase, effKind, intent])

  // ---- back (rendered in the panel header) ----
  const backFn: (() => void) | null = (() => {
    // The table waitlist has no form phase: back from its identify is the hours.
    if (phase === 'identify' && tableWl) return () => { setTableWl(false); setIntent('book'); setPhase('select') }
    if (phase === 'identify') return () => setPhase(intent === 'waitlist' ? 'waitlist' : 'select')
    if (phase === 'waitlist') return () => { setWlErr(''); setIntent('book'); setStepId('time'); setPhase('select') }
    if (phase === 'login') return () => { setLoginErr(''); setPhase('identify') }
    if (phase === 'otp') return () => { setOtpErr(''); setPhase('identify') }
    // The session stays: "Dalej" on the term asks the step again, without the SMS.
    if (phase === 'reward') return () => { setRewardNotice(null); setClaim(null); setClaimErr(''); setPhase('select') }
    if (phase === 'slotLost') return () => recoverSlot()
    // Back to the service list - other services may still be bookable for this viewer.
    if (phase === 'restricted') return () => { setStepId(firstStepOf(effKind)); setPhase('select') }
    // Closed: back leads to whatever is still open, otherwise it closes (launcher).
    if (phase === 'closed') return closedExit?.go ?? onClose ?? null
    if (phase === 'select') {
      // Configuring overlays the selection - back just closes it, keeping choices.
      if (configuring) return () => setConfiguringId(null)
      // Szczegóły usługi leżą na liście - wstecz wraca do listy, nie zamyka widgetu.
      if (detailsService) return () => setDetailsId(null)
      // One step back through the list that actually exists - no more asking
      // "was the previous step the provider one?" at every call site.
      const prev = selectSteps[stepIndex - 1]
      if (prev) return () => setStepId(prev)
      // First step of a family: go back to the fork when there was one, otherwise
      // close. Without this a mixed business had no way to change its mind.
      // Any business with a fork (it used to be only services + classes, which left
      // a rental or table customer no way back to it).
      if (stepId !== 'offering' && kinds.length > 1) {
        return () => { setKind(null); setStepId('offering') }
      }
      return onClose ?? null // first step: back closes (launcher)
    }
    return null // confirming / done
  })()

  // ---- identify / otp / login ----
  function onContactChange(c: Contact) {
    if (c.email !== contact.email) setEmailExists(false)
    setContact(c)
  }
  async function onCheckEmail() {
    if (!/.+@.+\..+/.test(contact.email)) return
    const r = await checkEmail(cfg, contact.email.trim().toLowerCase())
    if (!('error' in r)) setEmailExists(r.exists)
  }
  async function onSendCode(phone: string) {
    setContact((c) => ({ ...c, phone }))
    setSending(true)
    setIdentifyErr('')
    const r = await sendGuestOtp(cfg, { phone, turnstileToken })
    setSending(false)
    setTurnstileToken(null) // token is single-use - force a fresh solve next time
    if (!r.ok) {
      setIdentifyErr(
        r.code === 'RATE_LIMITED'
          ? `Poczekaj ${r.retryAfter ?? 60}s i spróbuj ponownie.`
          : r.code === 'CAPTCHA_REQUIRED'
            ? 'Potwierdź, że nie jesteś robotem, i spróbuj ponownie.'
            : r.code === 'SITE_KEY_REQUIRED'
              ? 'Rezerwacja jest chwilowo niedostępna.'
              : 'Nie udało się wysłać kodu. Spróbuj ponownie.',
      )
      return
    }
    setCode('')
    setAttemptsLeft(3)
    setOtpErr('')
    setOtpMode(r.mode)
    const maskedPhone = r.maskedPhone || maskPhone(phone)
    setOtpInfo({
      maskedPhone,
      expiresAt: Date.now() + r.expiresIn * 1000,
      resendAt: Date.now() + OTP_RESEND_MS,
      codeLength: r.codeLength,
    })
    setPhase('otp')
    emit('otp_sent', { maskedPhone, resend: false })
  }
  async function onResend() {
    setSending(true)
    setOtpErr('')
    const r = await sendGuestOtp(cfg, { phone: contact.phone, turnstileToken })
    setSending(false)
    setTurnstileToken(null)
    if (!r.ok) {
      setOtpErr(
        r.code === 'RATE_LIMITED'
          ? `Poczekaj ${r.retryAfter ?? 60}s.`
          : r.code === 'CAPTCHA_REQUIRED'
            ? 'Potwierdź, że nie jesteś robotem.'
            : 'Nie udało się wysłać kodu.',
      )
      return
    }
    setCode('')
    setAttemptsLeft(3)
    setOtpMode(r.mode)
    const maskedPhone = r.maskedPhone || maskPhone(contact.phone)
    setOtpInfo({
      maskedPhone,
      expiresAt: Date.now() + r.expiresIn * 1000,
      resendAt: Date.now() + OTP_RESEND_MS,
      codeLength: r.codeLength,
    })
    emit('otp_sent', { maskedPhone, resend: true })
  }
  async function onVerify(c: string) {
    if (verifying) return
    setVerifying(true)
    setOtpErr('')
    const r = await verifyGuestOtp(cfg, {
      firstName: contact.firstName.trim(),
      lastName: contact.lastName.trim(),
      email: contact.email.trim().toLowerCase(),
      phone: contact.phone,
      otp: c,
    })
    if (r.ok) {
      const a = { userId: r.data.userId, token: r.data.token }
      setAuth(a)
      emit('otp_verified', { userId: a.userId })
      emit('authenticated', { method: r.mode === 'login' ? 'otp-login' : 'otp', userId: a.userId })
      const allowed = await ensureBookingAccess(a)
      setVerifying(false)
      if (allowed) void complete(a)
      return
    }
    setVerifying(false)
    if (r.code === 'EMAIL_IN_USE') {
      setLoginReason('Ten e-mail ma już konto Vizyto. Zaloguj się, aby dokończyć rezerwację.')
      setPhase('login')
      return
    }
    if (r.code === 'EXPIRED') {
      setOtpErr('Kod wygasł. Wyślij nowy.')
      return
    }
    // The API's own sentence for these two (vizyto#309); a busy check did not use an attempt.
    if (r.code === 'OTP_LOCKED' || r.code === 'OTP_BUSY') {
      setCode('')
      setOtpErr(r.message ?? (r.code === 'OTP_LOCKED' ? 'Zbyt wiele prób dla tego numeru. Spróbuj ponownie później.' : 'Sprawdzamy już ten kod. Spróbuj ponownie za chwilę.'))
      return
    }
    const left = r.remainingAttempts ?? attemptsLeft - 1
    setAttemptsLeft(left)
    setCode('')
    if (left <= 0) {
      setIdentifyErr('Zbyt wiele prób. Wyślij nowy kod.')
      setPhase('identify')
      return
    }
    setOtpErr(`Nieprawidłowy kod. Pozostało prób: ${left}`)
  }
  async function onLogin(email: string, password: string) {
    if (loggingIn) return
    setLoggingIn(true)
    setLoginErr('')
    const r = await loginEmail(cfg, { email: email.trim().toLowerCase(), password })
    if (!r.ok) {
      setLoggingIn(false)
      setLoginErr(r.code === 'SITE_KEY_REQUIRED' ? 'Rezerwacja jest chwilowo niedostępna.' : 'Nieprawidłowy e-mail lub hasło.')
      return
    }
    const a = { userId: r.data.userId, token: r.data.token }
    setAuth(a)
    emit('authenticated', { method: 'password', userId: a.userId })
    const allowed = await ensureBookingAccess(a)
    setLoggingIn(false)
    if (allowed) void complete(a)
  }
  async function onOAuth(provider: OAuthProvider) {
    if (oauthBusy || loggingIn) return
    setOauthBusy(provider)
    setLoginErr('')
    const r = await oauthLogin(cfg, provider)
    if (!r.ok) {
      setOauthBusy(null)
      if (r.code === 'POPUP_CLOSED') return // user closed the popup - no error
      setLoginErr(
        r.code === 'POPUP_BLOCKED'
          ? 'Zezwól na wyskakujące okienka, aby zalogować się tą metodą.'
          : 'Logowanie nie powiodło się. Spróbuj ponownie.',
      )
      return
    }
    const a = { userId: r.data.userId, token: r.data.token }
    setAuth(a)
    emit('authenticated', { method: provider, userId: a.userId })
    const allowed = await ensureBookingAccess(a)
    setOauthBusy(null)
    if (allowed) void complete(a)
  }
  function goLogin() {
    setLoginReason('')
    setLoginErr('')
    setPhase('login')
  }
  // Shortcut from the access banner / locked calendar: jump into the phone
  // identify step before any slot is chosen, purely to establish who the viewer
  // is. After auth, ensureBookingAccess() + complete() resume selection.
  function goAccessLogin() {
    setIntent('book')
    setIdentifyErr('')
    emit('details_started', { serviceId: lines[0]?.service.id ?? null, accessCheck: true })
    setPhase('identify')
  }
  function recoverSlot() {
    clearSlotPin()
    setSlotKey('')
    setSlots([])
    setBookingErr('')
    setRefetch((x) => x + 1)
    setStepId('time')
    setPhase('select')
  }
  function restart() {
    setLines([])
    setEachMode(false)
    setAnyChosen(false)
    setEmptyProbe(null)
    setConfiguringId(null)
    setCartNotice(null)
    setDate('')
    setSlotKey('')
    setStepId(firstStepOf(kinds[0] ?? 'service'))
    // Availability left over from the FINISHED booking used to survive "Nowa
    // rezerwacja" - most visible inline, where that button is the only way out:
    // the day pills painted green for a cart that no longer existed. The details
    // overlay, the confirmed status and the "nothing ahead" latch are the same
    // class of leak.
    setCounts({})
    setSlots([])
    setChain(null)
    setLoadingSlots(false)
    setFindingNext(false)
    setNoneAhead(false)
    setDetailsId(null)
    setBookedStatus(null)
    setLoginReason('')
    // Class branch: drop the pick and the term, and re-ask which family when the
    // business has both (a second sign-up may well be for a visit this time).
    setClassPick(null)
    setSessionId(null)
    setSessions(null)
    // A business renting one thing starts on it again: it has no list step.
    const startPick = startingRentalOption(rentalOptions)
    setRentalPick(startPick)
    setRentalUnits(startingRentalUnits(startPick))
    setRentalParty(1)
    setRentalCounts({})
    setRentalSlots(null)
    setRentalRangeOk(null)
    setAppointmentBadges(null)
    setRentalBadges(null)
    setTableAdults(DEFAULT_ADULTS)
    setTableChildren(0)
    setTableZoneId(null)
    setTableCounts({})
    setTableCountsReady(false)
    setTableDay(null)
    setTableLoading(false)
    setTableErr(false)
    setTableSlot(null)
    setTableWl(false)
    setTableNotice(null)
    setQuote(null)
    setPriceChanged(false)
    setOffer(null)
    setRewardChoice(null)
    preferredReward.current = null
    claimFocus.current = false
    setRewardFocus(null)
    offering.current = false
    setRewardNotice(null)
    setRewardChecking(false)
    setActiveReward(null)
    setRewardRepriced(null)
    setClaim(null)
    setClaimBusy(false)
    setClaimErr('')
    setUsedReward(null)
    setDoneLoyalty(null)
    if (kinds.length > 1) { setKind(null); setStepId('offering') }
    setContact(emptyContact)
    setNotes('')
    setIntent('book')
    setWlPrefs(null)
    setWlBusy(false)
    setWlErr('')
    setEmailExists(false)
    setAuth(preAuth ?? null)
    setAccessOk(initialAccessOk)
    setCalRestricted(false)
    setCode('')
    setAttemptsLeft(3)
    setOtpInfo({ maskedPhone: '', expiresAt: 0, resendAt: 0, codeLength: 6 })
    setSending(false)
    setVerifying(false)
    setLoggingIn(false)
    setOauthBusy(null)
    booking.current = false
    setIdentifyErr('')
    setOtpErr('')
    setLoginErr('')
    setBookingErr('')
    setPhase('select')
  }

  // The visible step index IS the position in the list of existing steps, so the
  // collapsing of an absent provider step needs no special case any more.
  const termIdx = Math.max(selectSteps.indexOf('time'), selectSteps.indexOf('rentalTime'), selectSteps.indexOf('tableTime'))
  const progStep =
    phase === 'select'
      ? Math.max(stepIndex, 0)
      : phase === 'slotLost' || phase === 'waitlist'
        ? termIdx
        : totalSteps - 1
  // "Nagroda" is a sub-step of the last step (like the code from a message): it
  // keeps that number but says its own name. A customer signed in by the host
  // page never saw "Twoje dane". The changed-price screen of a reward is part of it.
  const progLabel = phase === 'reward' || (phase === 'confirming' && rewardRepriced) ? 'NAGRODA' : stepNames[progStep]
  const showCta = phase === 'select' && !configuring && !detailsService
  // Notes belong to a booking with a chosen term - not to a waitlist sign-up or an
  // access-check login. A table's term is its picked start, not a slot key.
  const notesOn = intent === 'book' && (effKind === 'table' ? !!tableSlot : !!slotKey)
  const tableTermsOn = effKind === 'table' && intent === 'book' && !!tableSlot
  // Whitelist banner on the selection phases: only for an unconfirmed viewer,
  // and not while the calendar already shows its own dedicated login prompt.
  const showAccessBanner =
    business.bookingAccess?.policy === 'restricted' && !accessOk && !auth && phase === 'select' && !((stepId === 'time' || stepId === 'tableTime') && calRestricted)
  // tel: link for the restricted screen (spaces/dashes stripped).
  const businessPhone = business.phone?.trim() || ''
  // The provider question is answered when every position carries an answer: in
  // per-position mode each staff line has one (a person or "bez preferencji"),
  // otherwise the whole cart shares one - and a pinned provider must still belong
  // to the current selectable set, or a stale id from a previous composition
  // would enable "Dalej".
  const resourceValid = eachMode
    ? getStaffItems(lines).every((l) => l.resourceId !== undefined)
    : cartResource === 'any' || (typeof cartResource === 'number' && selectableProviders.some((p) => p.id === cartResource))
  // Every position must satisfy its own add-on groups before the cart can move on.
  const cartValid = lines.length > 0 && !configuring && lines.every((l) => addonsValid(l.service, l.addonIds))
  const canAdvance =
    stepId === 'offering' ? kind != null
      : stepId === 'rental' ? !!rentalPick
        : stepId === 'rentalTime' ? rentalReady
          : stepId === 'tableParty' ? !tableGone
            : stepId === 'tableTime' ? !!tableSlot && !tableGone
          : stepId === 'class' ? !!classPick
        : stepId === 'session' ? !!chosenSession
          : stepId === 'service' ? cartValid
            : stepId === 'provider' ? resourceValid
              : !!slotKey
  const ctaPrice = lines.length ? (quote?.total != null ? priceLabel(quote.total) : priceLabel(shownPrice, showFrom)) : ''
  // The time step has to show who the hours belong to - and let it be changed
  // without walking back a step. A pool cart keeps its own (single) answer.
  const showProviderChip = lines.length > 0 && !isUnit && !providerAuto && (hasResourceStep || pinnedPeople.length > 0)
  const canEditProviders = getStaffItems(lines).some((l) => getResourcesForService(workers, l.service).length > 0)

  /**
   * Tytuł kreatora idzie za RODZAJEM oferty, a nie za nazwą produktu.
   * Wypożyczalnia nie umawia wizyt, tylko wydaje przedmioty, a klub zapisuje na
   * zajęcia - "Zarezerwuj wizytę" nad listą busów czytało się jak cudzy widget.
   * Gdy biznes sprzedaje kilka rodzin i klient jeszcze nie wybrał, zostaje
   * forma najogólniejsza.
   */
  const panelTitle =
    (needsOfferingStep && kind === null) || phase === 'closed'
      ? 'Zarezerwuj termin'
      : effKind === 'rental'
        ? 'Zarezerwuj przedmiot'
        : effKind === 'class'
          ? 'Zapisz się na zajęcia'
          : effKind === 'table'
            ? 'Zarezerwuj stolik'
            : 'Zarezerwuj wizytę'

  return (
    <div class="vz-panel" role="dialog" aria-modal={onClose ? 'true' : undefined} aria-label={panelTitle}>
      {onClose && <span class="vz-grab" aria-hidden="true" />}
      <header class="vz-head">
        {backFn ? (
          <button class="vz-iconbtn" onClick={backFn} aria-label="Wstecz" type="button"><ArrowLeft size={20} /></button>
        ) : (
          <span class="vz-head-spacer" />
        )}
        <div class="vz-title">{panelTitle}</div>
        {onClose ? (
          <button class="vz-iconbtn" onClick={onClose} aria-label="Zamknij" type="button"><Close size={20} /></button>
        ) : (
          <span class="vz-head-spacer" />
        )}
      </header>

      <div class="vz-body" ref={bodyRef} tabIndex={-1}>
        {/* The offering fork sits BEFORE the counter: the two families have
            different step counts, so numbering it would promise the wrong total. */}
        {phase !== 'done' && phase !== 'waitlistDone' && phase !== 'restricted' && phase !== 'closed' && !(phase === 'select' && stepId === 'offering') && (
          <ProgressBar step={progStep} total={totalSteps} label={progLabel} />
        )}

        {/* 'done' included on purpose: the test-mode disclaimer must survive onto
            the success screen - that's the moment the customer decides whether
            the booking is real. */}
        {business.isTestMode && (phase === 'select' || phase === 'identify' || phase === 'waitlist' || phase === 'done') && (
          <Notice title="Rezerwacja próbna">
            Ten salon dopiero uruchamia rezerwacje online. Złożona tu rezerwacja nie jest jeszcze wiążąca - potwierdź ją bezpośrednio z salonem.
          </Notice>
        )}

        {showAccessBanner && (
          <Notice title="Rezerwacje online dla stałych klientów">
            Zaloguj się numerem telefonu, aby sprawdzić swój dostęp.{' '}
            <button class="vz-link" onClick={goAccessLogin} type="button">Zaloguj się</button>
          </Notice>
        )}

        {phase === 'select' && configuringLine && (
          <StepConfigure
            service={configuringLine.service}
            variantDuration={configuringLine.variantDuration}
            addonIds={configuringLine.addonIds}
            workerId={lineWorker(configuringLine)}
            promotionSummary={promotionSummary}
            onPickVariant={pickVariant}
            onToggleAddon={toggleAddon}
            onDone={confirmConfigure}
          />
        )}
        {phase === 'select' && !configuring && stepId === 'service' && detailsService && (
          <StepDetails
            service={detailsService}
            workers={workers}
            selected={lines.some((l) => l.service.id === detailsService.id)}
            promotionSummary={promotionSummary}
            onToggle={() => {
              toggleService(detailsService)
              setDetailsId(null)
            }}
          />
        )}
        {phase === 'select' && stepId === 'offering' && (
          <StepOffering
            selected={kind}
            onPick={(k) => {
              setKind(k)
              // A day picked in another family says nothing about free tables:
              // the table branch seeds its own from the counts.
              if (k === 'table') { setDate(''); setTableSlot(null) }
              setStepId(firstStepOf(k))
            }}
            kinds={kinds}
            serviceLabel="Wizyta indywidualna"
            classLabel="Zajęcia grupowe"
            rentalLabel="Wynajem"
            tableLabel="Stolik"
          />
        )}
        {phase === 'select' && tableGone && (
          <Notice title="Rezerwacja stolika">Ten lokal nie przyjmuje rezerwacji stolików.</Notice>
        )}
        {phase === 'select' && stepId === 'tableParty' && !tableGone && (
          <StepTableParty
            options={tableOptions}
            adults={tableAdults}
            children={tableChildren}
            zoneId={tableZoneId}
            // The party and the zone change which hours exist: a picked start goes.
            onAdults={(n) => { setBookingErr(''); setTableNotice(null); setTableAdults(n); setTableSlot(null) }}
            onChildren={(n) => { setBookingErr(''); setTableNotice(null); setTableChildren(n); setTableSlot(null) }}
            onZone={(z) => { setBookingErr(''); setTableNotice(null); setTableZoneId(z); setTableSlot(null) }}
          />
        )}
        {phase === 'select' && stepId === 'tableTime' && !tableGone && !calRestricted && (
          <>
            {bookingErr && <Notice title="Nie udało się zarezerwować">{bookingErr}</Notice>}
            {tableNotice && <Notice title={tableNotice.title}>{tableNotice.text}</Notice>}
            <StepTableTime
              days={days}
              counts={tableCounts}
              date={date}
              onPickDate={(d) => { setBookingErr(''); setTableNotice(null); setDate(d); setTableSlot(null) }}
              day={tableDay}
              loading={tableLoading || (!date && !tableCountsReady)}
              error={tableErr}
              onRetry={() => setRefetch((x) => x + 1)}
              selectedStartAt={tableSlot?.startAt ?? null}
              onPickSlot={(startAt) => {
                const slot = tableDay?.periods.flatMap((p) => p.slots).find((x) => x.startAt === startAt) ?? null
                setBookingErr('')
                setTableNotice(null)
                setTableSlot(slot)
                if (slot) emit('datetime_selected', { table: true, partySize: guests, zoneId: tableZoneId, date, time: slot.time, startDate: slot.startAt })
              }}
              // The waitlist is its own channel action (#680), for tables as for visits.
              canWaitlist={business.waitlistEnabled !== false && allows('waitlist')}
              onWaitlist={startTableWaitlist}
              waitlistBusy={wlBusy}
            />
          </>
        )}
        {phase === 'select' && stepId === 'rental' && (
          <StepRentalItem
            options={rentalOptions}
            promotionSummary={promotionSummary}
            selectedKey={rentalPick ? rentalOptionKey(rentalPick) : null}
            onPick={(o) => {
              setRentalPick(o)
              // Length/party/day belong to the PREVIOUS offer - a lane's hours say
              // nothing about a trailer's days.
              setRentalUnits(startingRentalUnits(o))
              setRentalParty(1)
              setDate('')
              setSlotKey('')
              setRentalSlots(null)
              setRentalRangeOk(null)
              setStepId('rentalTime')
            }}
          />
        )}
        {phase === 'select' && stepId === 'rentalTime' && rentalPick && (
          <>
            {bookingErr && <Notice title="Nie udało się zarezerwować">{bookingErr}</Notice>}
            <StepRentalTime
              head={rentalPick.head}
              pooled={rentalPick.pooled}
              days={days}
              counts={rentalCounts}
              date={date}
              units={rentalUnits}
              unitOptions={rentalUnitOptions(rentalPick.head)}
              partySize={rentalParty}
              slots={rentalSlots}
              loading={rentalLoading}
              rangeOk={rentalRangeOk}
              promoBadges={rentalBadges}
              quote={quote}
              window={rentalWindow(rentalPick, date, rentalUnits, slotKey, business, rentalSlots)}
              tz={business.timezone}
              onPickDate={(d) => { setBookingErr(''); setDate(d); setSlotKey('') }}
              onPickUnits={(u) => { setBookingErr(''); setRentalUnits(u); setSlotKey('') }}
              onPickPartySize={(n) => { setBookingErr(''); setRentalParty(n); setSlotKey('') }}
              selectedSlot={slotKey}
              onPickSlot={(k) => { setBookingErr(''); setSlotKey(k) }}
            />
          </>
        )}
        {phase === 'select' && stepId === 'class' && (
          groupClasses === null
            ? <div class="vz-center"><Spinner /></div>
            : (
              <StepClass
                options={classOptions}
                promotionSummary={promotionSummary}
                selectedId={classPick?.cls.id ?? null}
                onPick={(o) => { setClassPick(o); setSessionId(null); setStepId('session') }}
              />
            )
        )}
        {phase === 'select' && stepId === 'session' && (
          <>
            {bookingErr && <Notice title="Nie udało się zapisać">{bookingErr}</Notice>}
            {sessions === null || (classPick === null && prefill?.classId != null)
              ? <div class="vz-center"><Spinner /></div>
              : (
                <StepSession
                  sessions={classSessions}
                  timezone={business.timezone ?? null}
                  selectedId={sessionId}
                  onPick={(x) => { setBookingErr(''); setSessionId(x.id) }}
                />
              )}
          </>
        )}
        {phase === 'select' && !configuring && stepId === 'service' && !detailsService && (
          <>
            {cartNotice && <Notice title={cartNotice.title}>{cartNotice.text}</Notice>}
            <StepService
              services={services}
              workers={workers}
              categories={categories}
              promotionSummary={promotionSummary}
              cart={lines.map((l) => ({
                serviceId: l.service.id,
                chips: lineChips(l),
                editable: serviceHasOptions(l.service),
                hideMeta: (l.service.durationOptions?.length ?? 0) > 0 && !!resolveVariant(l.service, l.variantDuration),
                issue: !addonsValid(l.service, l.addonIds),
              }))}
              onToggle={toggleService}
              onEdit={editLine}
              onDetails={setDetailsId}
            />
          </>
        )}
        {phase === 'select' && !configuring && stepId === 'provider' && lines.length > 0 && (
          <StepResource
            providers={selectableProviders}
            items={lines}
            workers={workers}
            mode={isUnit ? 'unit' : 'staff'}
            anyLabel={anyProviderLabel}
            selected={cartResource}
            perItem={eachMode}
            canPerItem={canPerItem}
            onPick={pickResource}
            onPickPerItem={pickPerItemMode}
            onPickItemResource={pickItemResource}
            performers={noSoloCandidate ? performersByService : undefined}
            promotionSummary={promotionSummary}
          />
        )}
        {phase === 'select' && !configuring && ((stepId === 'time' && lines.length > 0) || (stepId === 'tableTime' && !tableGone)) && calRestricted && (
          // Availability answered BOOKING_ACCESS_RESTRICTED for this (anonymous)
          // viewer - invite a login instead of rendering an empty calendar.
          <div class="vz-fade-in" style="text-align:center;padding:8px 0;">
            <div class="vz-check warn"><Lock size={26} /></div>
            <div class="vz-done-title" style="font-size:18px;">{stepId === 'tableTime' ? 'Rezerwacje dla stałych gości' : 'Usługa dla stałych klientów'}</div>
            <p class="vz-lead" style="margin-top:8px;">
              {stepId === 'tableTime'
                ? 'Ten lokal udostępnia rezerwacje online wybranym gościom. Zaloguj się numerem telefonu, aby sprawdzić swój dostęp.'
                : 'Ten salon udostępnia rezerwacje online wybranym klientom. Zaloguj się numerem telefonu, aby sprawdzić swój dostęp.'}
            </p>
            <button class="vz-btn mt" onClick={goAccessLogin} type="button">Zaloguj się</button>
          </div>
        )}
        {phase === 'select' && !configuring && stepId === 'time' && lines.length > 0 && !calRestricted && (
          <StepDateTime
            days={days}
            counts={counts}
            date={date}
            slots={slots}
            loading={loadingSlots}
            timezone={business.timezone}
            selectedSlot={slotKey}
            onPickDate={(d) => { setDate(d); setSlotKey(''); clearSlotPin() }}
            onPickSlot={(key) => {
              // A refinement belongs to the hour it was made at: the pinned person
              // may simply be busy at the new one, while availability stayed
              // union-wide. Keeping it would send create after someone the slot
              // list never claimed was free.
              clearSlotPin()
              setSlotKey(key)
              emit('datetime_selected', { ...bookingCtx(key), slotKey: key })
            }}
            canWaitlist={canWaitlist}
            onJoinWaitlist={startWaitlist}
            onFindNext={findNextFree}
            findingNext={findingNext}
            noneAhead={noneAhead}
            chain={chainPlan}
            slotPicker={slotPicker}
            providerChip={showProviderChip ? {
              label: providerName,
              people: pinnedPeople.map((p) => ({ name: p.name, image: p.image })),
              plural: pinnedPeople.length > 1 || (pinnedPeople.length > 0 && someUnassigned),
              editor: canEditProviders
                ? (close: () => void) => <ItemProviders items={lines} workers={workers} onPick={pickItemResource} promotionSummary={promotionSummary} direct onPicked={close} />
                : undefined,
            } : undefined}
            emptyReason={emptyProbe === 'others' ? 'busy' : undefined}
            onCheckAll={checkAllSpecialists}
            promoBadges={appointmentBadges}
          />
        )}

        {phase === 'waitlist' && waitlistLine && (
          <StepWaitlist
            serviceName={waitlistLine.service.name}
            workerName={providerName}
            date={date}
            onSubmit={onWaitlistFormSubmit}
            onShowSlots={(d) => {
              // The pre-check found free slots in the chosen window - jump the
              // calendar there instead of accepting a pointless signup.
              setDate(d)
              setSlotKey('')
              setPhase('select')
            }}
            check={(win) =>
              checkWaitlistWindow(cfg, { businessServiceId: waitlistLine.service.id, resourceId: anyChosen ? null : lineWorker(waitlistLine) ?? null, ...win }, auth?.token)
            }
            busy={wlBusy}
            error={wlErr}
          />
        )}

        {phase === 'identify' && (
          <StepIdentify
            // Access-check login (no slot picked yet): no summary and no notes -
            // the user is only confirming who they are.
            summary={
              intent === 'waitlist' ? (tableWl ? tableWaitlistSummary : waitlistSummary)
                : effKind === 'table' ? (tableSlot ? tableSummaryRows : [])
                : effKind === 'class' ? classSummaryRows
                  : effKind === 'rental' ? rentalSummaryRows
                    : slotKey ? summaryRows : []
            }
            quote={intent === 'book' ? quote : null}
            contact={contact}
            onChange={onContactChange}
            notes={notesOn ? notes : undefined}
            onNotes={notesOn ? setNotes : undefined}
            notesLabel={effKind === 'table' ? 'Uwagi dla lokalu (opcjonalnie)' : undefined}
            notesPlaceholder={effKind === 'table' ? 'Np. krzesełko dla dziecka, okazja, alergie' : undefined}
            // A table's own rules, where a visit shows its cancellation window.
            terms={tableTermsOn ? (
              <>
                {tableOptions?.confirmationMode === 'manual' && <Notice title="Lokal potwierdzi rezerwację" tone="plain" />}
                <Notice title="Zasady rezerwacji" tone="plain">
                  {tableOptions ? `${holdRule(tableOptions.lateAfterMinutes)} ` : ''}{TABLE_CANCEL_RULE}
                </Notice>
                {business.bookingPolicy?.importantInfo?.trim() && (
                  <Notice title="Ważne informacje" tone="plain">
                    <span class="vz-notice-pre">{business.bookingPolicy.importantInfo.trim()}</span>
                  </Notice>
                )}
              </>
            ) : undefined}
            // Terms belong to a booking; a waitlist sign-up and an access-check
            // login are not the moment to state a cancellation window.
            policy={intent === 'book' && slotKey ? cartPolicy : undefined}
            emailExists={emailExists}
            onCheckEmail={onCheckEmail}
            onSendCode={onSendCode}
            onGoLogin={goLogin}
            sending={sending}
            error={identifyErr}
            turnstileKey={cfg.turnstileKey}
            turnstileToken={turnstileToken}
            onTurnstile={setTurnstileToken}
          />
        )}
        {phase === 'login' && (
          <StepLogin
            email={contact.email}
            prefillReason={loginReason}
            onChangeEmail={(v) => onContactChange({ ...contact, email: v })}
            onSubmit={onLogin}
            onOAuth={onOAuth}
            oauthBusy={oauthBusy}
            social={socialLogin(cfg.siteKey, cfg.loginHref)}
            onBackToGuest={() => { setLoginErr(''); setPhase('identify') }}
            loggingIn={loggingIn}
            error={loginErr}
          />
        )}
        {phase === 'otp' && (
          <StepOtp
            existingAccount={otpMode === 'login'}
            maskedPhone={otpInfo.maskedPhone}
            codeLength={otpInfo.codeLength}
            code={code}
            onCode={setCode}
            onComplete={onVerify}
            onResend={onResend}
            verifying={verifying}
            resending={sending}
            error={otpErr}
            now={now}
            expiresAt={otpInfo.expiresAt}
            resendAt={otpInfo.resendAt}
            turnstileKey={cfg.turnstileKey}
            turnstileToken={turnstileToken}
            onTurnstile={setTurnstileToken}
          />
        )}
        {phase === 'reward' && offer && rewardView && (
          <StepReward
            flow={offer.flow}
            program={offer.wallet.program}
            wallet={offer.wallet}
            catalog={offer.catalog}
            lines={offer.lines}
            ordinaryTotal={offer.ordinary.total}
            usable={rewardView.usable}
            blocked={rewardView.blocked}
            claimables={rewardView.claimable}
            choice={rewardChoice}
            onChoose={setRewardChoice}
            onRetry={retryRewardPrice}
            claimOpen={claim?.item.catalog.id ?? null}
            claimBusy={claimBusy}
            claimError={claimErr}
            onOpenClaim={openClaim}
            onCancelClaim={() => {
              // The panel goes; its entry's "Odbierz" comes back and takes focus.
              if (claim) setRewardFocus({ to: 'claim', id: claim.item.catalog.id })
              setClaim(null)
              setClaimErr('')
            }}
            onConfirmClaim={() => void confirmClaim()}
            notice={rewardNotice}
            serviceNames={serviceNames}
            focus={rewardFocus}
            onFocused={() => setRewardFocus(null)}
          />
        )}
        {phase === 'confirming' &&
          (rewardRepriced ? (
            // The reward's fresh quote has another total: the customer confirms it.
            <div class="vz-fade-in">
              <Notice title={REWARD_RECOVERY.repriced.title} tone="plain">
                {REWARD_RECOVERY.repriced.text} {amountDueSentence(rewardRepriced.quote.total, 'Do zapłaty z nagrodą')}
              </Notice>
              <Button
                onClick={() => {
                  const next = rewardRepriced
                  setRewardRepriced(null)
                  if (offerRef.current) bookWithReward(offerRef.current, next)
                }}
              >
                {offer?.flow === 'class' ? 'Zapisuję się' : 'Rezerwuję'}
              </Button>
              <Button variant="ghost" onClick={() => { setRewardRepriced(null); setActiveReward(null); setPhase('reward') }}>Anuluj</Button>
            </div>
          ) : rewardChecking ? (
            <div class="vz-center"><Spinner /></div>
          ) : priceChanged && quote ? (
            <div class="vz-fade-in">
              <Notice title="Aktualizacja ceny" tone="plain">
                Cena się zmieniła. Sprawdź nową cenę i potwierdź rezerwację.
              </Notice>
              {/* The new price once: the quote block when advertised, else one row. */}
              <SummaryCard
                rows={quote.advertised ? [] : [{ label: 'Cena', value: quote.total != null ? priceLabel(quote.total) : 'Cena na miejscu', total: true }]}
                quote={quote}
              />
              <button class="vz-btn mt" onClick={retryBooking} type="button">Potwierdź rezerwację</button>
            </div>
          ) : bookingErr ? (
            <div class="vz-fade-in">
              <div class="vz-err" role="alert">{bookingErr}</div>
              <button class="vz-btn mt" onClick={retryBooking} type="button">Spróbuj ponownie</button>
            </div>
          ) : (
            <div class="vz-center" style="flex-direction:column;gap:14px;"><Spinner /> {effKind === 'table' ? 'Rezerwuję stolik…' : 'Rezerwuję Twoją wizytę…'}</div>
          ))}
        {phase === 'slotLost' && (
          <div class="vz-fade-in" style="text-align:center;padding:8px 0;">
            <div class="vz-done-title" style="font-size:18px;">Ten termin właśnie zniknął</div>
            <p class="vz-lead" style="margin-top:8px;">Ktoś był szybszy. Wybierz inny wolny termin - Twoje dane zostają zapisane.</p>
            <button class="vz-btn mt" onClick={recoverSlot} type="button">Wybierz inny termin</button>
          </div>
        )}
        {phase === 'restricted' && (
          <div class="vz-fade-in" style="text-align:center;padding:8px 0;">
            <div class="vz-check warn"><Lock size={26} /></div>
            <div class="vz-done-title" style="font-size:18px;">Rezerwacje dla wybranych klientów</div>
            <p class="vz-lead" style="margin-top:8px;">
              Rezerwacje online w tym salonie są dostępne dla wybranych klientów. Skontaktuj się z salonem, aby umówić wizytę.
            </p>
            {businessPhone && (
              <a class="vz-btn mt" href={`tel:${businessPhone.replace(/[\s\-()]/g, '')}`}>
                <Phone size={17} /> Zadzwoń: {businessPhone}
              </a>
            )}
            <button
              class={`vz-btn${businessPhone ? ' ghost' : ' mt'}`}
              onClick={() => { setStepId(firstStepOf(effKind)); setPhase('select') }}
              type="button"
            >
              {effKind === 'table' ? 'Wróć' : 'Wróć do usług'}
            </button>
          </div>
        )}
        {phase === 'closed' && closedFor && (
          // Calm, not an error: the business decided this, and the way to still
          // book is the phone (never discouraged) or what else stays open.
          <div class="vz-fade-in" style="text-align:center;padding:8px 0;" role="status">
            <div class="vz-check calm"><CalendarDays size={26} /></div>
            <div class="vz-done-title" style="font-size:18px;">{closedTable ? CLOSED_TABLE.title : CLOSED_TITLE[closedFor]}</div>
            <p class="vz-lead" style="margin-top:8px;">
              {closedFor === 'waitlist' && closedExit
                ? `Wybierz inny wolny termin w kalendarzu${businessPhone ? ' albo zadzwoń do firmy' : ''}.`
                : `${closedTable ? CLOSED_TABLE.goal : CLOSED_GOAL[closedFor]}, ${businessPhone ? 'zadzwoń do firmy' : 'skontaktuj się bezpośrednio z firmą'}.`}
            </p>
            {businessPhone && (
              <a class="vz-btn mt" href={`tel:${businessPhone.replace(/[\s\-()]/g, '')}`}>
                <Phone size={17} /> Zadzwoń: {businessPhone}
              </a>
            )}
            {closedExit && (
              <button class={`vz-btn${businessPhone ? ' ghost' : ' mt'}`} onClick={closedExit.go} type="button">
                {closedExit.label}
              </button>
            )}
          </div>
        )}
        {phase === 'done' && (
          <StepDone
            rows={withRewardRows(
              effKind === 'class' ? classSummaryRows : effKind === 'rental' ? rentalSummaryRows : effKind === 'table' ? tableSummaryRows : summaryRows,
              usedReward,
              effKind === 'rental' ? 'Kwota' : 'Cena',
            )}
            // The reward quote is what was booked; its price row says so plainly
            // (a promotion block would put the reward's price under the promotion's badge).
            quote={usedReward ? { ...usedReward.quote, advertised: false } : quote}
            loyalty={effKind === 'table' ? null : doneLoyalty}
            status={bookedStatus}
            email={contact.email}
            kind={effKind}
            onClose={onClose}
            onRestart={restart}
          />
        )}
        {phase === 'waitlistDone' && (
          <div class="vz-done vz-fade-in">
            <div class="vz-check"><Bell size={28} /></div>
            <div class="vz-done-title">Jesteś na liście!</div>
            <div class="vz-done-sub">
              {tableWl ? (
                <>Damy Ci znać SMS-em{contact.email ? ' i e-mailem' : ''}, gdy zwolni się stolik dla <b style="color:var(--vz-text)">{partyGenitive(guests)}</b>.</>
              ) : (
                <>Damy Ci znać SMS-em{contact.email ? ' i e-mailem' : ''}, gdy tylko zwolni się pasujący termin usługi <b style="color:var(--vz-text)">{waitlistLine?.service.name}</b>.</>
              )}
            </div>
            <div style="margin-top:18px;text-align:left;"><SummaryCard rows={tableWl ? tableWaitlistSummary : waitlistSummary} /></div>
            {onClose ? <Button onClick={onClose}>Gotowe</Button> : <Button variant="ghost" onClick={restart}>Nowa rezerwacja</Button>}
          </div>
        )}
      </div>

      {phase === 'reward' && offer && (
        <div class="vz-cta">
          <div class="vz-cta-summary">
            <div class="vz-cta-left">
              <div class="vz-cta-svc">{chosenReward ? chosenReward.reward.termsSnapshot.name : 'Bez nagrody'}</div>
              <div class="vz-cta-meta">
                {rewardPending ? (
                  <>Do zapłaty: <span class="vz-skel" aria-hidden="true" /></>
                ) : (() => {
                  const total = chosenReward?.quote?.status === 'ok' ? chosenReward.quote.quote.total : offer.ordinary.total
                  return total == null ? 'Cena na miejscu' : <>Do zapłaty: <b>{formatPersonalTotalInline(total)}</b></>
                })()}
              </div>
            </div>
          </div>
          <button class="vz-btn" onClick={confirmReward} disabled={rewardPending || claimBusy} type="button">
            {offer.flow === 'class' ? 'Zapisuję się' : 'Rezerwuję'}
          </button>
        </div>
      )}
      {showCta && (
        <div class="vz-cta">
          <div class="vz-cta-summary">
            <div class="vz-cta-left">
              {effKind === 'table' ? (
                stepId === 'offering' ? (
                  <div class="vz-cta-meta">Wybierz, co chcesz zarezerwować</div>
                ) : (
                  <>
                    <div class="vz-cta-svc">Stolik</div>
                    <div class="vz-cta-meta">
                      <b>{tablePartyLabel(guests)}</b>
                      {tableSlot && date ? ` · ${dayMonth(date)}, ${tableSlot.time}` : ''}
                    </div>
                  </>
                )
              ) : effKind === 'rental' ? (
                rentalPick ? (
                  <>
                    <div class="vz-cta-svc">
                      {rentalPick.pooled ? (rentalPick.head.rentalTypeName ?? rentalPick.head.name) : rentalPick.head.name}
                    </div>
                    <div class="vz-cta-meta">
                      {(() => {
                        if (rentalSummaryPromo && !rentalSummaryPromo.offTerm) {
                          return <b>{rentalSummaryPromo.isFrom ? 'od ' : ''}{formatPrice2(rentalSummaryPromo.total)}</b>
                        }
                        const t = quote?.total ?? rentalPrice(rentalPick.head, rentalUnits)
                        return t != null ? <b>{formatPrice2(t)}</b> : null
                      })()}
                      {' '}· {rentalUnitsLabel(rentalUnits, rentalPick.head.rentalUnit ?? 'hour')}
                    </div>
                    {rentalSummaryPromo && <SummaryPromoLine promo={rentalSummaryPromo} />}
                  </>
                ) : (
                  <div class="vz-cta-meta">{stepId === 'offering' ? 'Wybierz, co chcesz zarezerwować' : 'Wybierz przedmiot, aby kontynuować'}</div>
                )
              ) : effKind === 'class' ? (
                classPick ? (
                  <>
                    <div class="vz-cta-svc">{classPick.service.name}</div>
                    <div class="vz-cta-meta">
                      <b>{priceLabel(chosenSession?.promo?.price ?? classPick.service.price)}</b> · {formatDuration(classPick.service.duration)}
                      {chosenSession?.instructor?.name ? ` · ${chosenSession.instructor.name}` : ''}
                    </div>
                  </>
                ) : (
                  <div class="vz-cta-meta">{stepId === 'offering' ? 'Wybierz, co chcesz zarezerwować' : 'Wybierz zajęcia, aby kontynuować'}</div>
                )
              ) : lines.length ? (
                <>
                  <div class="vz-cta-svc">{lines.map((l) => l.service.name).join(', ')}</div>
                  <div class="vz-cta-meta">
                    <b>{summaryPromo && !summaryPromo.offTerm ? `${summaryPromo.isFrom ? 'od ' : ''}${formatPrice2(summaryPromo.total)}` : ctaPrice}</b> · {positionsLabel(lines.length)} · {formatDuration(shownDuration)}
                  </div>
                  {summaryPromo && <SummaryPromoLine promo={summaryPromo} />}
                  {lines.length === 1 && serviceHasOptions(lines[0]!.service) && (
                    <div class="vz-cta-cfg">
                      <button class="vz-link" onClick={() => setConfiguringId(lines[0]!.service.id)} type="button">Zmień wariant / dodatki</button>
                    </div>
                  )}
                </>
              ) : (
                <div class="vz-cta-meta">{stepId === 'offering' ? 'Wybierz, co chcesz zarezerwować' : 'Wybierz usługę, aby kontynuować'}</div>
              )}
            </div>
            {effKind === 'service' && stepId !== 'service' && (eachMode || cartResource != null) && (
              <div class="vz-cta-who">
                {pinnedResource && !eachMode ? (
                  <span class="vz-card-av">{pinnedResource.image ? <CdnImg src={pinnedResource.image} width={112} alt="" /> : pinnedResource.name.charAt(0)}</span>
                ) : (
                  <AvatarStack people={pinnedPeople.map((p) => ({ name: p.name, image: p.image }))} max={2} />
                )}
                <span>{providerName}</span>
              </div>
            )}
          </div>
          <button class="vz-btn" onClick={dalej} disabled={!canAdvance} type="button">
            Dalej <ArrowRight size={18} />
          </button>
        </div>
      )}

      <Powered />
    </div>
  )
}
