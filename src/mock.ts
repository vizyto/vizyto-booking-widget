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
  CheckEmailResult,
  DayCounts,
  LoginResult,
  OtpSendResult,
  OtpVerifyResult,
  Slots,
} from './api'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

const BUSINESS: Business = {
  id: 24,
  name: 'Proper Barbershop',
  slug: 'proper-barbershop',
  timezone: 'Europe/Warsaw',
  services: [
    { id: 1, name: 'Strzyżenie', description: 'Klasyczne strzyżenie', price: 6000, duration: 45, bookingType: 'single', bookingMode: null },
    { id: 2, name: 'Broda', description: 'Modelowanie brody', price: 5000, duration: 30, bookingType: 'single', bookingMode: null },
    { id: 3, name: 'Strzyżenie + broda', description: 'Pełny pakiet', price: 10000, duration: 75, bookingType: 'single', bookingMode: null },
  ],
  resources: [
    { id: 11, type: 'worker', name: 'Marek', position: 'Barber', image: null },
    { id: 12, type: 'worker', name: 'Kuba', position: 'Senior barber', image: null },
    { id: 13, type: 'worker', name: 'Ola', position: 'Barberka', image: null },
  ],
  workingHours: [],
}

const WORKER_IDS = BUSINESS.resources.map((r) => r.id)

export async function fetchBusiness(): Promise<Business> {
  await wait(280)
  return BUSINESS
}

// Sundays closed; every 4th day from today thinned to zero so "Brak terminów"
// states are reachable. Deterministic (date-driven), no randomness needed.
function dayIsOpen(ymd: string): boolean {
  const d = new Date(ymd + 'T00:00:00')
  if (d.getDay() === 0) return false
  const idx = Math.round((d.getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000)
  return idx % 4 !== 2
}

export async function getCounts(p: { startDate: string; endDate: string }): Promise<DayCounts> {
  await wait(200)
  const out: DayCounts = {}
  const start = new Date(p.startDate + 'T00:00:00')
  const end = new Date(p.endDate + 'T00:00:00')
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const ymd = d.toISOString().slice(0, 10)
    out[ymd] = dayIsOpen(ymd) ? 7 : 0
  }
  return out
}

export async function getAvailability(p: { date: string }): Promise<Slots> {
  await wait(320)
  if (!dayIsOpen(p.date)) return {}
  const slots: Slots = {}
  // UTC keys 08:00..13:30 render ~10:00..15:30 in Europe/Warsaw (summer).
  for (let h = 8; h <= 13; h++) {
    slots[`${String(h).padStart(2, '0')}:00`] = WORKER_IDS
    slots[`${String(h).padStart(2, '0')}:30`] = WORKER_IDS
  }
  slots['13:55'] = WORKER_IDS // sentinel: picking this triggers a "slot gone" on book
  return slots
}

let lastOtpAt = 0
let attempts = 0

export async function sendGuestOtp(p: { phone: string }): Promise<OtpSendResult> {
  await wait(450)
  const since = (Date.now() - lastOtpAt) / 1000
  if (lastOtpAt && since < 60) return { ok: false, code: 'RATE_LIMITED', retryAfter: Math.ceil(60 - since) }
  lastOtpAt = Date.now()
  attempts = 0
  // eslint-disable-next-line no-console
  console.info('%c[vizyto mock] OTP = 1234', 'color:#fd9320;font-weight:bold')
  return { ok: true, expiresIn: 300, maskedPhone: p.phone.replace(/\d(?=\d{3})/g, '*') }
}

export async function verifyGuestOtp(p: {
  firstName: string
  lastName: string
  email: string
  phone: string
  otp: string
}): Promise<OtpVerifyResult> {
  await wait(500)
  if (p.email.trim().toLowerCase() === 'taken@example.com') return { ok: false, code: 'EMAIL_IN_USE' }
  if (p.otp === '1234') {
    lastOtpAt = 0
    return { ok: true, data: { userId: 999, token: 'mock-token' } }
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

export async function createAppointment(
  p: { startDate: string },
  token: string | null,
): Promise<{ ok: true; data: any } | { ok: false; code: string }> {
  await wait(600)
  if (token === 'stale') return { ok: false, code: 'BOOKED_BY_MISMATCH' }
  if (/T\d{2}:55/.test(p.startDate)) return { ok: false, code: 'SLOT_TAKEN' }
  return { ok: true, data: { id: 12345, status: 'confirmed' } }
}
