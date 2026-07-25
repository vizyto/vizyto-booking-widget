// In-memory mock of the Vizyto public API, activated by data-vizyto-api="mock".
// Lets the whole booking + OTP + login flow be exercised locally before the
// backend endpoints ship. Test levers:
//   - OTP code is always 1234 (also printed to the console on send)
//   - email "taken@example.com" -> EMAIL_IN_USE (verify) / exists (checkEmail)
//   - login: taken@example.com + any non-empty password succeeds
//   - picking a slot at :55 -> createAppointment reports the slot is gone
//   - token "stale" -> BOOKED_BY_MISMATCH
import type {
  Business,
  CartItem,
  CartItemTime,
  CheckEmailResult,
  DayCounts,
  LoginResult,
  OtpSendResult,
  OtpVerifyResult,
  ServiceCategory,
  Slots,
  WaitlistCheck,
  WaitlistCheckParams,
  WaitlistParams,
  WaitlistResult,
} from './api'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Inline gradient thumbnail (data URI) so the service photo renders in mock mode
// without a network fetch. Real businesses serve gallery images over the CDN.
const THUMB =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='%23fd9320'/><stop offset='1' stop-color='%23bf700f'/></linearGradient></defs><rect width='120' height='120' fill='url(%23g)'/></svg>"

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
      image: THUMB, images: [{ id: 1, url: THUMB, orderIndex: 0 }],
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
    // (or "Dowolny"). Exercises the unit-pick step.
    {
      id: 4, name: 'Loża VIP', description: 'Prywatna loża z obsługą', price: 12000, duration: 60,
      bookingType: 'single', fulfillmentMode: 'unit', providerSelection: 'customer', primaryObjectCategoryTag: 'loza',
    },
  ],
  resources: [
    { id: 11, type: 'worker', name: 'Marek', position: 'Barber', image: null, isBookable: true, isCustomerSelectable: true, categoryTag: null },
    { id: 12, type: 'worker', name: 'Kuba', position: 'Senior barber', image: null, isBookable: true, isCustomerSelectable: true, categoryTag: null },
    { id: 13, type: 'worker', name: 'Ola', position: 'Barberka', image: null, isBookable: true, isCustomerSelectable: true, categoryTag: null },
    // 'loza' pool for the unit service.
    { id: 21, type: 'object', name: 'Loża 1', position: null, image: null, isBookable: true, isCustomerSelectable: true, categoryTag: 'loza' },
    { id: 22, type: 'object', name: 'Loża 2', position: null, image: null, isBookable: true, isCustomerSelectable: true, categoryTag: 'loza' },
  ],
  workingHours: [],
  // Demo levers: show the "rezerwacja próbna" notice and enable the waitlist so
  // both flows are reachable in the local configurator.
  isTestMode: true,
  waitlistEnabled: true,
}

export async function fetchBusiness(): Promise<Business> {
  await wait(280)
  return BUSINESS
}

export async function getServiceCategories(): Promise<ServiceCategory[]> {
  await wait(120)
  return [
    { id: 1, name: 'Włosy', serviceIds: [1] },
    { id: 2, name: 'Broda i pakiety', serviceIds: [2, 3] },
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
  console.info('%c[vizyto mock] OTP = 1234', 'color:#fd9320;font-weight:bold')
  return { ok: true, expiresIn: 300, maskedPhone: p.phone.replace(/\d(?=\d{3})/g, '*'), mode: isExistingAccountPhone(p.phone) ? 'login' : 'guest' }
}

export async function verifyGuestOtp(p: {
  firstName: string
  lastName: string
  email: string
  phone: string
  otp: string
}): Promise<OtpVerifyResult> {
  await wait(500)
  if (p.otp === '1234' && isExistingAccountPhone(p.phone)) {
    lastOtpAt = 0
    return { ok: true, data: { userId: 555, token: 'mock-token' }, mode: 'login' }
  }
  if (p.email.trim().toLowerCase() === 'taken@example.com') return { ok: false, code: 'EMAIL_IN_USE' }
  if (p.otp === '1234') {
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

export async function createAppointment(
  p: { startDate: string },
  token: string | null,
): Promise<{ ok: true; data: any } | { ok: false; code: string }> {
  await wait(600)
  if (token === 'stale') return { ok: false, code: 'BOOKED_BY_MISMATCH' }
  if (/T\d{2}:55/.test(p.startDate)) return { ok: false, code: 'SLOT_TAKEN' }
  return { ok: true, data: { id: 12345, status: 'confirmed' } }
}
