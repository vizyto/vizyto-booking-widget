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
// Whitelist gate for online booking (bookingAccess on the business). For a
// 'restricted' business viewerCanBook is null for an anonymous viewer - the UI
// should invite a login, not refuse.
export type BookingAccessPolicy = 'everyone' | 'restricted'
export type BookingAccess = { policy: BookingAccessPolicy; viewerCanBook: boolean | null }
// Viewer's access to a single service. 'locked' stays selectable (logging in
// may unlock it) and renders with a discreet chip; hidden services never reach
// the widget at all.
export type ServiceViewerAccess = 'bookable' | 'locked'
// How the service is fulfilled (offerings-pool F2): 'staff' = customer picks a
// worker, 'unit' = no worker, the server (or the customer, via the pool) targets
// a free object of the primary requirement's type (bowling lane, court, station).
export type FulfillmentMode = 'staff' | 'unit'
// Online booking: 'customer' = the wizard shows a provider pick step (worker or
// pool unit, with a "Dowolny" option); 'auto' = no step, the server assigns the
// first free provider.
export type ProviderSelection = 'customer' | 'auto'
// A gallery image on a service (service_images), sorted by orderIndex.
export type ServiceImage = { id: number; url: string; orderIndex: number }
// Length preset ("1 godz. - 60 zł"). A service with >=2 options lets the customer
// pick one; the chosen durationMinutes drives both the slot length and the price.
export type ServiceDurationOption = { label: string | null; durationMinutes: number; priceCents: number | null }
// A single add-on inside a group. price/extraDurationMinutes stack on top of the
// service (and the chosen variant) when the customer selects it.
export type ServiceAddon = { id: number; name: string; description: string | null; price: number; extraDurationMinutes: number }
// Add-ons grouped for the booking UI. minSelect/maxSelect bound the group; loose
// add-ons (no group) land in a pseudo-group { id: 0, minSelect: 0, maxSelect: null }.
export type ServiceAddonGroup = { id: number; name: string; description: string | null; minSelect: number; maxSelect: number | null; addons: ServiceAddon[] }
export type Service = {
  id: number
  name: string
  description: string | null
  price: number // grosze (business default; a worker may override it)
  duration: number // minutes (business default; a worker may override it)
  bookingType: string
  // Offerings-pool: how the service is realized and who picks the provider.
  // Both default server-side (staff / customer) for older payloads.
  fulfillmentMode?: FulfillmentMode
  providerSelection?: ProviderSelection
  // For a 'unit' service: the object pool (primary requirement's categoryTag)
  // taking the bookings. The unit-pick step lists that pool's members. Null for
  // staff services or list payloads that skip the requirements relation.
  primaryObjectCategoryTag?: string | null
  // Length/price presets; empty = fixed `duration`/`price`. >=2 -> customer picks.
  durationOptions?: ServiceDurationOption[]
  // Add-ons pinned to this service; empty when the query skipped the relation.
  addonGroups?: ServiceAddonGroup[]
  // Gallery (sorted) + main photo (first image url) for the service card.
  images?: ServiceImage[]
  image?: string | null
  resourceServices?: ResourceService[]
  viewerAccess?: ServiceViewerAccess
}
export type Resource = {
  id: number
  type: 'worker' | 'object'
  name: string
  position: string | null
  image: string | null
  // Offerings-pool selectability. A pool unit shown in the unit-pick step must be
  // bookable AND customer-selectable and carry the service's primary categoryTag.
  // Optional so older payloads (workers only) keep working: absent = assume true
  // for a worker (the flow already filtered to bookable workers server-side).
  isBookable?: boolean
  isCustomerSelectable?: boolean
  categoryTag?: string | null
}
export type WorkingHour = { id: number; dayOfWeek: number; openTime: string; closeTime: string; isOpened: boolean }
export type Business = {
  id: number
  name: string
  slug: string | null
  timezone: string | null
  // Contact phone - shown on the access-restricted screen so a turned-away
  // customer still has a way to book.
  phone?: string | null
  services: Service[]
  resources: Resource[]
  workingHours: WorkingHour[]
  // Migration/trial period: bookings are non-binding "practice" bookings and the
  // UI shows a "rezerwacja próbna" notice. Derived server-side from testModeEnabledAt.
  isTestMode?: boolean
  // Whether the business accepts waitlist sign-ups when a day has no free slots.
  waitlistEnabled?: boolean
  // Whitelist gate; absent (older API) = open to everyone.
  bookingAccess?: BookingAccess
}

// A named group of services (PRO -> kategorie usług). Fetched from a separate
// public endpoint; the widget maps each category to the ids of the services it
// contains and reuses the service objects already loaded on the business.
export type ServiceCategory = { id: number; name: string; serviceIds: number[] }

// Free chain-start times for a day, as UTC "HH:mm" keys. The cart engine resolves
// the resource(s) per slot internally, so unlike the legacy map the widget only
// needs the start times.
export type Slots = string[]
export type DayCounts = Record<string, number>
export type GuestData = { userId: number; token: string | null }

// One cart position sent to the availability + create endpoints. Array order =
// chain order. resourceId: number = pinned, null/omitted = "Dowolny" (the engine
// assigns). durationMinutes = the chosen length preset (variant). Every field is
// declared in the API's t.Object schema, so nothing is silently stripped.
export type CartItem = {
  businessServiceId: number
  resourceId?: number | null
  addonIds?: number[]
  durationMinutes?: number | null
}

// mode: 'login' = the phone already belongs to a Vizyto account and the SAME
// code will log the customer into it (no duplicate guest account); 'guest' =
// the classic guest-signup path.
export type OtpMode = 'login' | 'guest'
export type OtpSendResult =
  | { ok: true; expiresIn: number; maskedPhone: string; mode: OtpMode }
  | { ok: false; code: 'RATE_LIMITED' | 'SITE_KEY_REQUIRED' | 'NETWORK' | string; retryAfter?: number }
export type OtpVerifyResult =
  | { ok: true; data: GuestData; mode: OtpMode }
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

// The availability GETs answer 403 { code: 'BOOKING_ACCESS_RESTRICTED' } when
// the viewer may not book the service (whitelist gate). Surfaced as a flag so
// the calendar can invite a login instead of showing a silently empty grid.
export type CountsResult = { counts: DayCounts; restricted: boolean }

// Chain geometry for the picked cart: where each position starts relative to the
// chain start, and how long it runs. Constant per request - it does not depend on
// which slot the customer ends up choosing.
export type CartItemTime = { itemIndex: number; startOffsetMinutes: number; durationMinutes: number }

export type SlotsResult = {
  slots: Slots
  itemTimes: CartItemTime[]
  totalMinutes: number
  /** Only when asked with includeCandidates: per slot, per position, who is free. */
  slotCandidates?: Record<string, number[][]>
  restricted: boolean
}

async function isAccessRestricted(r: Response): Promise<boolean> {
  if (r.status !== 403) return false
  const data = await r.json().catch(() => null)
  return (data as any)?.code === 'BOOKING_ACCESS_RESTRICTED'
}

// Per-day free-slot counts over a range, via the cart contract (POST). A single
// item is still a 1-element cart, so variants/add-ons that lengthen the chain are
// reflected in the counts. bookedById resolves the whitelist gate for the
// logged-in user (anonymously a restricted business fails soft to all-zero here;
// the slots call + the create backstop still guard access).
export async function getCartCounts(
  cfg: Cfg,
  p: { startDate: string; endDate: string; items: CartItem[]; bookedById?: number },
): Promise<CountsResult> {
  if (cfg.mock) return { counts: await mock.getCounts({ startDate: p.startDate, endDate: p.endDate, items: p.items }), restricted: false }
  try {
    const r = await fetch(`${cfg.apiBase}/api/public/businesses/${cfg.businessId}/appointments/availability/cart/counts`, {
      method: 'POST',
      headers: headers(cfg),
      body: JSON.stringify({ from: p.startDate, to: p.endDate, items: p.items, bookedById: p.bookedById || undefined }),
    })
    if (r.ok) return { counts: (await r.json()) as DayCounts, restricted: false }
    return { counts: {}, restricted: await isAccessRestricted(r) }
  } catch {
    return { counts: {}, restricted: false }
  }
}

// Free chain-start times for one day, via the cart contract (POST). Returns a
// flat list of UTC "HH:mm" keys; the chosen variant length + add-ons are baked
// into the chain the engine plans.
export async function getCartSlots(
  cfg: Cfg,
  p: { date: string; items: CartItem[]; bookedById?: number; includeCandidates?: boolean },
): Promise<SlotsResult> {
  if (cfg.mock) return { ...(await mock.getAvailability({ date: p.date, items: p.items })), restricted: false }
  try {
    const r = await fetch(`${cfg.apiBase}/api/public/businesses/${cfg.businessId}/appointments/availability/cart`, {
      method: 'POST',
      headers: headers(cfg),
      body: JSON.stringify({
        date: p.date,
        items: p.items,
        bookedById: p.bookedById || undefined,
        ...(p.includeCandidates ? { includeCandidates: true } : {}),
      }),
    })
    if (r.ok) {
      const data = (await r.json()) as { slots?: Slots; itemTimes?: CartItemTime[]; totalMinutes?: number; slotCandidates?: Record<string, number[][]> }
      return {
        slots: Array.isArray(data.slots) ? data.slots : [],
        itemTimes: Array.isArray(data.itemTimes) ? data.itemTimes : [],
        totalMinutes: data.totalMinutes ?? 0,
        slotCandidates: data.slotCandidates,
        restricted: false,
      }
    }
    return { slots: [], itemTimes: [], totalMinutes: 0, restricted: await isAccessRestricted(r) }
  } catch {
    return { slots: [], itemTimes: [], totalMinutes: 0, restricted: false }
  }
}

// The first day+time with a free chain start, scanning forward from today (the
// server sweeps 60 days). Lets an empty day offer "najbliższy wolny termin"
// instead of a dead end - parytet z kreatorem WEB.
export async function getCartFirstFree(
  cfg: Cfg,
  p: { items: CartItem[]; from?: string; bookedById?: number },
): Promise<{ date: string; time: string } | null> {
  if (cfg.mock) return mock.getFirstFree({ from: p.from })
  try {
    const r = await fetch(`${cfg.apiBase}/api/public/businesses/${cfg.businessId}/appointments/availability/cart/first-free`, {
      method: 'POST',
      headers: headers(cfg),
      body: JSON.stringify({ from: p.from, items: p.items, bookedById: p.bookedById || undefined }),
    })
    if (!r.ok) return null
    const data = await r.json()
    return data && data.date && data.time ? { date: data.date, time: data.time } : null
  } catch {
    return null
  }
}

// Lightweight viewer-access probe (GET .../booking-access). bookedById is a
// plain query param - the same trust model as the availability endpoints; the
// authoritative gate stays in POST /appointments. Fails open on network/HTTP
// errors: a hiccup must not block a legitimate booking, the POST backstop
// still guards the write.
export type BookingAccessCheck = {
  policy: BookingAccessPolicy
  viewerCanBook: boolean | null
  serviceAccess: 'bookable' | 'locked' | 'hidden' | null
}

export async function checkBookingAccess(
  cfg: Cfg,
  p: { bookedById?: number; businessServiceId?: number },
): Promise<BookingAccessCheck> {
  const open: BookingAccessCheck = { policy: 'everyone', viewerCanBook: true, serviceAccess: 'bookable' }
  if (cfg.mock) return open
  const q = new URLSearchParams()
  if (p.bookedById != null) q.set('bookedById', String(p.bookedById))
  if (p.businessServiceId != null) q.set('businessServiceId', String(p.businessServiceId))
  try {
    const r = await fetch(`${cfg.apiBase}/api/public/businesses/${cfg.businessId}/booking-access?${q}`, { headers: headers(cfg) })
    if (!r.ok) return open
    const data = await r.json().catch(() => null)
    if (!data) return open
    return {
      policy: data.policy === 'restricted' ? 'restricted' : 'everyone',
      viewerCanBook: typeof data.viewerCanBook === 'boolean' ? data.viewerCanBook : null,
      serviceAccess: data.serviceAccess ?? null,
    }
  } catch {
    return open
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
    if (r.ok) return { ok: true, expiresIn: data.expiresIn ?? 300, maskedPhone: data.maskedPhone ?? '', mode: data.mode === 'login' ? 'login' : 'guest' }
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
    if (r.ok) return { ok: true, data: { userId: data.userId, token: data.token ?? null }, mode: data.mode === 'login' ? 'login' : 'guest' }
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

export type WaitlistCheckParams = {
  businessServiceId: number
  resourceId?: number | null
  dateFrom: string // YYYY-MM-DD (business local)
  dateTo: string // YYYY-MM-DD (business local)
  timeFrom?: string | null // HH:mm (business local) or null = any
  timeTo?: string | null
}
export type WaitlistCheck = { available: boolean; date: string | null; time: string | null; matchedSlots: number }

const NO_SLOTS: WaitlistCheck = { available: false, date: null, time: null, matchedSlots: 0 }

// Pre-check of a prospective waitlist window: the waitlist is a fallback, so
// when the window still has a bookable slot the form steers to booking instead.
// Fails open (available: false) - the server enforces the same gate on join.
export async function checkWaitlistWindow(cfg: Cfg, p: WaitlistCheckParams): Promise<WaitlistCheck> {
  if (cfg.mock) return mock.checkWaitlistWindow(p)
  try {
    const q = new URLSearchParams({ businessServiceId: String(p.businessServiceId), dateFrom: p.dateFrom, dateTo: p.dateTo })
    if (p.resourceId) q.set('resourceId', String(p.resourceId))
    if (p.timeFrom) q.set('timeFrom', p.timeFrom)
    if (p.timeTo) q.set('timeTo', p.timeTo)
    const r = await fetch(`${cfg.apiBase}/api/public/businesses/${cfg.businessId}/waitlist/check?${q.toString()}`, {
      headers: headers(cfg),
    })
    if (!r.ok) return NO_SLOTS
    const data = await r.json().catch(() => null)
    return data && typeof data.available === 'boolean' ? data : NO_SLOTS
  } catch {
    return NO_SLOTS
  }
}

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
  p: { items: CartItem[]; startDate: string; bookedById: number; notes?: string; idempotencyKey: string },
  token: string | null,
): Promise<{ ok: true; data: any } | { ok: false; code: string }> {
  if (cfg.mock) return mock.createAppointment({ startDate: p.startDate }, token)
  try {
    const extra: Record<string, string> = { 'Idempotency-Key': p.idempotencyKey }
    if (token) extra.authorization = `Bearer ${token}`
    const r = await fetch(`${cfg.apiBase}/api/public/businesses/${cfg.businessId}/appointments`, {
      method: 'POST',
      headers: headers(cfg, extra),
      // Cart contract: array order = chain order. Each item carries its own
      // resourceId (null = Dowolny), add-ons and chosen variant length.
      body: JSON.stringify({ bookedById: p.bookedById, items: p.items, startDate: p.startDate, notes: p.notes }),
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

// ---- variants + add-ons --------------------------------------------------
// The service DTO carries length presets (durationOptions) and grouped add-ons
// (addonGroups). The helpers below resolve the effective price/duration the
// customer sees for a given variant + add-on selection, mirroring the web wizard.

// A service needs a configure sub-step only when it offers a choice: >=2 length
// presets or at least one add-on group.
export function serviceHasOptions(s: Service): boolean {
  return (s.durationOptions?.length ?? 0) >= 2 || (s.addonGroups?.length ?? 0) > 0
}

// The chosen length preset, or the shortest one as the default (mirrors the API
// default and the web wizard). Null when the service has no presets.
export function resolveVariant(service: Service, chosenDurationMinutes: number | null): ServiceDurationOption | null {
  const opts = service.durationOptions ?? []
  if (opts.length === 0) return null
  if (chosenDurationMinutes != null) {
    const hit = opts.find((o) => o.durationMinutes === chosenDurationMinutes)
    if (hit) return hit
  }
  return opts.reduce((a, b) => (b.durationMinutes < a.durationMinutes ? b : a))
}

// Base price/duration before add-ons. A chosen variant is authoritative (the
// server does not recompute it from worker overrides); otherwise fall back to
// the per-worker override for a pinned worker, else the service base.
function variantOrBase(service: Service, variant: ServiceDurationOption | null, workerId?: number): { price: number; duration: number } {
  if (variant) {
    // A variant with null priceCents ("cena na miejscu") falls back to the pinned
    // worker's override, then the service base - mirroring the server's create
    // precedence (chosenDurationPrice ?? resourceService.price ?? service.price).
    const fallback = typeof workerId === 'number' ? effectiveForWorker(service, workerId).price : service.price
    return { price: variant.priceCents ?? fallback, duration: variant.durationMinutes }
  }
  if (typeof workerId === 'number') return effectiveForWorker(service, workerId)
  return { price: service.price, duration: service.duration }
}

// Price + extra minutes contributed by the selected add-ons.
export function addonTotals(service: Service, addonIds: number[]): { price: number; extraMinutes: number } {
  if (addonIds.length === 0) return { price: 0, extraMinutes: 0 }
  const chosen = new Set(addonIds)
  let price = 0
  let extraMinutes = 0
  for (const g of service.addonGroups ?? []) {
    for (const a of g.addons) {
      if (chosen.has(a.id)) {
        price += a.price
        extraMinutes += a.extraDurationMinutes
      }
    }
  }
  return { price, extraMinutes }
}

// Names of the selected add-ons, in group order, for summaries.
export function addonNames(service: Service, addonIds: number[]): string[] {
  if (addonIds.length === 0) return []
  const chosen = new Set(addonIds)
  const out: string[] = []
  for (const g of service.addonGroups ?? []) for (const a of g.addons) if (chosen.has(a.id)) out.push(a.name)
  return out
}

// A group is under-filled when fewer than minSelect add-ons are chosen. Blocks
// advancing; the server re-validates on create. maxSelect is enforced in the UI
// by locking unchecked rows once the cap is hit.
export type AddonGroupIssue = { groupId: number; name: string; need: number }
export function addonGroupIssues(service: Service, addonIds: number[]): AddonGroupIssue[] {
  const chosen = new Set(addonIds)
  const issues: AddonGroupIssue[] = []
  for (const g of service.addonGroups ?? []) {
    const count = g.addons.filter((a) => chosen.has(a.id)).length
    if (count < g.minSelect) issues.push({ groupId: g.id, name: g.name, need: g.minSelect - count })
  }
  return issues
}
export const addonsValid = (service: Service, addonIds: number[]): boolean => addonGroupIssues(service, addonIds).length === 0

// Effective price/duration for the full configuration (variant + add-ons), for a
// pinned worker when known. Used for the CTA, summary and analytics value.
export function configuredTotals(
  service: Service,
  chosenDurationMinutes: number | null,
  addonIds: number[],
  workerId?: number,
): { price: number; duration: number } {
  const base = variantOrBase(service, resolveVariant(service, chosenDurationMinutes), workerId)
  const add = addonTotals(service, addonIds)
  return { price: base.price + add.price, duration: base.duration + add.extraMinutes }
}

// Base price range for the service card, before add-ons. When the service has
// length presets the range spans them; otherwise it spans the offering workers'
// (possibly overridden) prices. `from` drives the "od" prefix.
export function serviceBaseRange(service: Service, workers: Resource[]): { min: number; max: number; from: boolean } {
  const opts = service.durationOptions ?? []
  // Any length preset drives the card price (matching the server + web, which
  // treat one option as a variant); "od" applies only when the presets differ.
  if (opts.length > 0) {
    const prices = opts.map((o) => o.priceCents ?? service.price)
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    return { min, max, from: min !== max }
  }
  const { min, max } = priceRange(service, workers)
  return { min, max, from: min !== max }
}

// ---- rich text -----------------------------------------------------------
// Service descriptions are sanitized HTML (Tiptap, server-side allowlist). The
// widget renders them as plain, clamped text - no innerHTML in the Shadow DOM -
// mirroring richTextToPlain in the web app. DOMParser never executes scripts;
// a regex strip is the fallback for exotic environments.
export function richTextToPlain(html: string | null | undefined): string {
  if (!html) return ''
  const raw = String(html)
  try {
    const doc = new DOMParser().parseFromString(raw, 'text/html')
    return (doc.body.textContent || '').replace(/\s+/g, ' ').trim()
  } catch {
    return raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  }
}

// ---- idempotency ---------------------------------------------------------
// Deterministic per booking intent (business + slot + cart + user), mirroring the
// web app's bookingIdempotencyKey: a retry / double-click resolves to the same
// appointment instead of a duplicate. Sent as the Idempotency-Key header (a body
// field would be stripped by the API's t.Object schema).
export function bookingIdempotencyKey(p: {
  businessId: number
  startDate: string
  items: CartItem[]
  bookedById: number
  notes?: string
}): string {
  // Order matters: the array order IS the chain order, so two carts with the same
  // services in a different sequence are different bookings.
  const sig = p.items
    .map((it) => [
      it.businessServiceId,
      it.resourceId ?? 'any',
      (it.addonIds ?? []).slice().sort((a, b) => a - b).join('.'),
      it.durationMinutes ?? 'base',
    ].join('-'))
    .join('|')
  return `vzw-${p.businessId}-${p.startDate}-${sig}-${p.bookedById}-${(p.notes ?? '').length}`
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
