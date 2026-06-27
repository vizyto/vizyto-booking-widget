// Framework-agnostic client for the Vizyto public booking API. All calls carry
// the publishable site key; writes additionally carry the guest/customer Bearer
// token. The host page's origin must be registered on the key (PRO -> Strona
// WWW). When cfg.mock is set (data-vizyto-api="mock") every call is served by
// the in-memory mock backend so the full flow is testable before the API ships.

import * as mock from './mock'

export type Cfg = { apiBase: string; siteKey: string; businessId: number; token?: string; mock?: boolean }

export type Service = {
  id: number
  name: string
  description: string | null
  price: number // grosze
  duration: number // minutes
  bookingType: string
  bookingMode: string | null
}
export type Resource = {
  id: number
  type: 'worker' | 'object'
  name: string
  position: string | null
  image: string | null
}
export type WorkingHour = { id: number; dayOfWeek: number; openTime: string; closeTime: string; isOpened: boolean }
export type Business = {
  id: number
  name: string
  slug: string | null
  timezone: string | null
  services: Service[]
  resources: Resource[]
  workingHours: WorkingHour[]
}

export type Slots = Record<string, number[]> // UTC "HH:mm" -> available resourceIds
export type DayCounts = Record<string, number>
export type GuestData = { userId: number; token: string | null }

export type OtpSendResult =
  | { ok: true; expiresIn: number; maskedPhone: string }
  | { ok: false; code: 'RATE_LIMITED' | 'SITE_KEY_REQUIRED' | 'NETWORK' | string; retryAfter?: number }
export type OtpVerifyResult =
  | { ok: true; data: GuestData }
  | { ok: false; code: 'INVALID' | 'EXPIRED' | 'EMAIL_IN_USE' | 'NETWORK' | string; remainingAttempts?: number }
export type CheckEmailResult = { exists: boolean; providers: string[] } | { error: true }
export type LoginResult =
  | { ok: true; data: GuestData }
  | { ok: false; code: 'INVALID_CREDENTIALS' | 'SITE_KEY_REQUIRED' | 'NETWORK' | string }

function headers(cfg: Cfg, extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { 'content-type': 'application/json' }
  if (cfg.siteKey) h['x-vizyto-site-key'] = cfg.siteKey
  return { ...h, ...(extra || {}) }
}

export async function fetchBusiness(cfg: Cfg): Promise<Business | null> {
  if (cfg.mock) return mock.fetchBusiness()
  try {
    const r = await fetch(`${cfg.apiBase}/api/public/businesses/${cfg.businessId}`, { headers: headers(cfg) })
    return r.ok ? ((await r.json()) as Business) : null
  } catch {
    return null
  }
}

export async function getCounts(
  cfg: Cfg,
  p: { startDate: string; endDate: string; businessServiceId: number; resourceId?: number },
): Promise<DayCounts> {
  if (cfg.mock) return mock.getCounts(p)
  const q = new URLSearchParams({ startDate: p.startDate, endDate: p.endDate, businessServiceId: String(p.businessServiceId) })
  if (p.resourceId) q.set('resourceId', String(p.resourceId))
  try {
    const r = await fetch(`${cfg.apiBase}/api/public/businesses/${cfg.businessId}/appointments/availability-counts?${q}`, {
      headers: headers(cfg),
    })
    return r.ok ? ((await r.json()) as DayCounts) : {}
  } catch {
    return {}
  }
}

export async function getAvailability(
  cfg: Cfg,
  p: { date: string; businessServiceId: number; resourceId?: number },
): Promise<Slots> {
  if (cfg.mock) return mock.getAvailability(p)
  const q = new URLSearchParams({ date: p.date, businessServiceId: String(p.businessServiceId) })
  if (p.resourceId) q.set('resourceId', String(p.resourceId))
  try {
    const r = await fetch(`${cfg.apiBase}/api/public/businesses/${cfg.businessId}/appointments/availability?${q}`, {
      headers: headers(cfg),
    })
    return r.ok ? ((await r.json()) as Slots) : {}
  } catch {
    return {}
  }
}

export async function sendGuestOtp(cfg: Cfg, p: { phone: string }): Promise<OtpSendResult> {
  if (cfg.mock) return mock.sendGuestOtp(p)
  try {
    const r = await fetch(`${cfg.apiBase}/api/public/guest/otp/send`, {
      method: 'POST',
      headers: headers(cfg),
      body: JSON.stringify({ businessId: cfg.businessId, phone: p.phone }),
    })
    const data = await r.json().catch(() => ({}))
    if (r.ok) return { ok: true, expiresIn: data.expiresIn ?? 300, maskedPhone: data.maskedPhone ?? '' }
    if (r.status === 429) return { ok: false, code: 'RATE_LIMITED', retryAfter: data?.retryAfter }
    return { ok: false, code: data?.code || `HTTP_${r.status}` }
  } catch {
    return { ok: false, code: 'NETWORK' }
  }
}

export async function verifyGuestOtp(
  cfg: Cfg,
  p: { firstName: string; lastName: string; email: string; phone: string; otp: string },
): Promise<OtpVerifyResult> {
  if (cfg.mock) return mock.verifyGuestOtp(p)
  try {
    const r = await fetch(`${cfg.apiBase}/api/public/guest/otp/verify`, {
      method: 'POST',
      headers: headers(cfg),
      body: JSON.stringify({ businessId: cfg.businessId, ...p }),
    })
    const data = await r.json().catch(() => ({}))
    if (r.ok) return { ok: true, data: { userId: data.userId, token: data.token ?? null } }
    if (r.status === 409) return { ok: false, code: 'EMAIL_IN_USE' }
    return {
      ok: false,
      code: data?.code || (r.status === 400 ? 'INVALID' : `HTTP_${r.status}`),
      remainingAttempts: data?.remainingAttempts,
    }
  } catch {
    return { ok: false, code: 'NETWORK' }
  }
}

export async function checkEmail(cfg: Cfg, email: string): Promise<CheckEmailResult> {
  if (cfg.mock) return mock.checkEmail(email)
  try {
    const r = await fetch(`${cfg.apiBase}/api/public/auth/check-email`, {
      method: 'POST',
      headers: headers(cfg),
      body: JSON.stringify({ email }),
    })
    if (!r.ok) return { error: true }
    const data = await r.json()
    return { exists: !!data.exists, providers: data.providers ?? [] }
  } catch {
    return { error: true }
  }
}

export async function loginEmail(cfg: Cfg, p: { email: string; password: string }): Promise<LoginResult> {
  if (cfg.mock) return mock.loginEmail(p)
  try {
    const r = await fetch(`${cfg.apiBase}/api/public/guest/login`, {
      method: 'POST',
      headers: headers(cfg),
      body: JSON.stringify({ businessId: cfg.businessId, ...p }),
    })
    const data = await r.json().catch(() => ({}))
    if (r.ok && data.token) return { ok: true, data: { userId: data.userId, token: data.token } }
    if (r.status === 403) return { ok: false, code: 'SITE_KEY_REQUIRED' }
    return { ok: false, code: data?.code || 'INVALID_CREDENTIALS' }
  } catch {
    return { ok: false, code: 'NETWORK' }
  }
}

export async function createAppointment(
  cfg: Cfg,
  p: { businessServiceId: number; startDate: string; bookedById: number; resourceId?: number },
  token: string | null,
): Promise<{ ok: true; data: any } | { ok: false; code: string }> {
  if (cfg.mock) return mock.createAppointment(p, token)
  try {
    const r = await fetch(`${cfg.apiBase}/api/public/businesses/${cfg.businessId}/appointments`, {
      method: 'POST',
      headers: headers(cfg, token ? { authorization: `Bearer ${token}` } : undefined),
      body: JSON.stringify(p),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, code: data?.code || `HTTP_${r.status}` }
    return { ok: true, data }
  } catch {
    return { ok: false, code: 'NETWORK' }
  }
}

// ---- formatting / phone helpers -----------------------------------------

export const slotStartDate = (date: string, utcKey: string) => `${date}T${utcKey.slice(0, 5)}:00.000Z`

export function slotLabel(date: string, utcKey: string, tz: string | null): string {
  try {
    return new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: tz || 'Europe/Warsaw' }).format(
      new Date(slotStartDate(date, utcKey)),
    )
  } catch {
    return utcKey.slice(0, 5)
  }
}

export const formatPrice = (g: number) =>
  (g / 100).toLocaleString('pl-PL', { style: 'currency', currency: 'PLN', minimumFractionDigits: 0, maximumFractionDigits: 0 })

// Two-decimal price ("70,00 zł"), matching the Vizyto app.
export const formatPrice2 = (g: number) =>
  (g / 100).toLocaleString('pl-PL', { style: 'currency', currency: 'PLN', minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const formatDuration = (m: number) =>
  m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`

// Normalize a typed Polish phone to canonical +48XXXXXXXXX. Accepts +48, 48,
// 0048, or a bare 9-digit national number, ignoring spaces/dashes/parens.
// Returns null when it isn't a plausible PL mobile/landline number.
export function normalizePlPhone(raw: string): string | null {
  let d = raw.replace(/[\s\-()./]/g, '')
  if (d.startsWith('+')) d = d.slice(1)
  if (d.startsWith('0048')) d = d.slice(2)
  if (d.startsWith('48') && d.length === 11) d = d.slice(2)
  if (!/^\d{9}$/.test(d)) return null
  return `+48${d}`
}

export const maskPhone = (phone: string) => phone.replace(/\d(?=\d{3})/g, '*')
