// Framework-agnostic client for the Vizyto public booking API. All calls carry
// the publishable site key; writes additionally carry the guest/customer Bearer
// token. The host page's origin must be registered on the key (PRO -> Strona
// WWW). When cfg.mock is set (data-vizyto-api="mock") every call is served by
// the in-memory mock backend so the full flow is testable before the API ships.

import * as mock from './mock'

export type Cfg = { apiBase: string; siteKey: string; businessId: number; token?: string; turnstileKey?: string; mock?: boolean }

// Per-employee override of a service's price/duration. The business can set a
// different price/duration for a given worker; the API resolves the fallback
// (override value ?? service base) and returns it as effectivePrice/Duration.
// A service's active rows also define *which* workers offer it at all.
export type ResourceService = {
  id: number
  resourceId: number
  businessServiceId: number
  effectivePrice: number // grosze
  effectiveDuration: number // minutes
  isActive: boolean
}
export type Service = {
  id: number
  name: string
  description: string | null
  price: number // grosze (business default; a worker may override it)
  duration: number // minutes (business default; a worker may override it)
  bookingType: string
  bookingMode: string | null
  resourceServices?: ResourceService[]
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
  // Migration/trial period: bookings are non-binding "practice" bookings and the
  // UI shows a "rezerwacja próbna" notice. Derived server-side from testModeEnabledAt.
  isTestMode?: boolean
  // Whether the business accepts waitlist sign-ups when a day has no free slots.
  waitlistEnabled?: boolean
}

// A named group of services (PRO -> kategorie usług). Fetched from a separate
// public endpoint; the widget maps each category to the ids of the services it
// contains and reuses the service objects already loaded on the business.
export type ServiceCategory = { id: number; name: string; serviceIds: number[] }

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
export type OAuthProvider = 'google' | 'apple' | 'facebook'

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

export async function getServiceCategories(cfg: Cfg): Promise<ServiceCategory[]> {
  if (cfg.mock) return mock.getServiceCategories()
  try {
    const r = await fetch(`${cfg.apiBase}/api/public/businesses/${cfg.businessId}/service-categories`, { headers: headers(cfg) })
    if (!r.ok) return []
    const data = await r.json()
    const arr = Array.isArray(data) ? data : data?.data ?? []
    return arr
      .map((c: any) => ({
        id: c.id,
        name: c.name,
        // Each category row wraps the service in { businessService: {...} }.
        serviceIds: (c.services ?? []).map((s: any) => s.businessService?.id ?? s.businessServiceId).filter((x: any) => x != null),
      }))
      .filter((c: ServiceCategory) => c.serviceIds.length > 0)
  } catch {
    return []
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

export async function sendGuestOtp(cfg: Cfg, p: { phone: string; turnstileToken?: string | null }): Promise<OtpSendResult> {
  if (cfg.mock) return mock.sendGuestOtp(p)
  try {
    const r = await fetch(`${cfg.apiBase}/api/public/guest/otp/send`, {
      method: 'POST',
      headers: headers(cfg),
      body: JSON.stringify({ businessId: cfg.businessId, phone: p.phone, turnstileToken: p.turnstileToken || undefined }),
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

// "Log in with Vizyto" via OAuth. Opens a popup to the Vizyto-hosted embed
// bridge; the bridge runs the provider sign-in and postMessages back a bearer
// token (only to this origin, gated by the site key). window.open MUST run in
// the click gesture, so it's the first thing the executor does.
export function oauthLogin(cfg: Cfg, provider: OAuthProvider): Promise<LoginResult> {
  if (cfg.mock) return mock.oauthLogin(provider)
  return new Promise((resolve) => {
    let apiOrigin: string
    try {
      apiOrigin = new URL(cfg.apiBase).origin
    } catch {
      resolve({ ok: false, code: 'CONFIG' })
      return
    }
    const w = 480
    const h = 660
    const left = Math.max(0, Math.round((window.screen.width - w) / 2))
    const top = Math.max(0, Math.round((window.screen.height - h) / 2))
    const q = new URLSearchParams({ provider, businessId: String(cfg.businessId), origin: location.origin, key: cfg.siteKey })
    const popup = window.open(`${cfg.apiBase}/api/public/auth/embed/start?${q}`, 'vizyto-oauth', `width=${w},height=${h},left=${left},top=${top}`)
    if (!popup) {
      resolve({ ok: false, code: 'POPUP_BLOCKED' })
      return
    }
    let settled = false
    const finish = (r: LoginResult) => {
      if (settled) return
      settled = true
      clearInterval(timer)
      window.removeEventListener('message', onMsg)
      try {
        popup.close()
      } catch {}
      resolve(r)
    }
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== apiOrigin || e.source !== popup) return
      const d = e.data as any
      if (!d || d.type !== 'vizyto-auth') return
      if (d.ok && d.token) finish({ ok: true, data: { userId: d.userId, token: d.token } })
      else finish({ ok: false, code: d.code || 'OAUTH_FAILED' })
    }
    const timer = setInterval(() => {
      if (popup.closed) finish({ ok: false, code: 'POPUP_CLOSED' })
    }, 500)
    window.addEventListener('message', onMsg)
  })
}

export type WaitlistParams = {
  businessServiceId: number
  resourceId?: number | null
  dateFrom: string // YYYY-MM-DD (business local)
  dateTo: string // YYYY-MM-DD (business local)
  timeFrom?: string | null // HH:mm (business local) or null = any
  timeTo?: string | null
  bookedById: number
}
export type WaitlistResult = { ok: true; data: any } | { ok: false; code: string }

// Join the waitlist for a service on a date range / time window. Requires an
// authenticated user with a complete profile (name + phone), so the widget runs
// the same guest-OTP / login path as booking before calling this.
export async function joinWaitlist(cfg: Cfg, p: WaitlistParams, token: string | null): Promise<WaitlistResult> {
  if (cfg.mock) return mock.joinWaitlist(p, token)
  try {
    const r = await fetch(`${cfg.apiBase}/api/public/businesses/${cfg.businessId}/waitlist`, {
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

export async function createAppointment(
  cfg: Cfg,
  p: { businessServiceId: number; startDate: string; bookedById: number; resourceId?: number; notes?: string },
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

// ---- per-employee price/duration overrides -------------------------------
// The business can override a service's price and duration for an individual
// worker (PRO -> pracownik -> usługi). The public API delivers these as
// service.resourceServices[]; the helpers below resolve the value the customer
// actually sees for a chosen specialist, mirroring the Vizyto client app.

// Effective price/duration when this service is performed by a given worker.
// Falls back to the service base when the worker has no override row.
export function effectiveForWorker(service: Service, workerId: number): { price: number; duration: number } {
  const rs = service.resourceServices?.find((r) => r.resourceId === workerId && r.isActive)
  return rs ? { price: rs.effectivePrice, duration: rs.effectiveDuration } : { price: service.price, duration: service.duration }
}

// Whether a worker offers this service at all. When the service has active
// override rows, only the listed workers offer it; when it has none (legacy or
// unmapped services, e.g. the mock), every worker is assumed to offer it at the
// base price.
export function workerOffersService(service: Service, workerId: number): boolean {
  const rows = service.resourceServices?.filter((r) => r.isActive)
  if (!rows || rows.length === 0) return true
  return rows.some((r) => r.resourceId === workerId)
}

// Min/max effective price across the given workers who offer the service. Used
// for "od" (from) display on the service step and for "Dowolny specjalista".
export function priceRange(service: Service, workers: Resource[]): { min: number; max: number } {
  const prices = workers.filter((w) => workerOffersService(service, w.id)).map((w) => effectiveForWorker(service, w.id).price)
  if (prices.length === 0) return { min: service.price, max: service.price }
  return { min: Math.min(...prices), max: Math.max(...prices) }
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
