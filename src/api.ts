// Framework-agnostic client for the Vizyto public booking API. All calls carry
// the publishable site key; writes additionally carry the guest Bearer token.
// The host page's origin must be registered on the key (PRO -> Strona WWW).

export type Cfg = { apiBase: string; siteKey: string; businessId: number }

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

function headers(cfg: Cfg, extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { 'content-type': 'application/json' }
  if (cfg.siteKey) h['x-vizyto-site-key'] = cfg.siteKey
  return { ...h, ...(extra || {}) }
}

export async function fetchBusiness(cfg: Cfg): Promise<Business | null> {
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

export async function guestSignup(
  cfg: Cfg,
  c: { firstName: string; lastName: string; phone: string; email: string },
): Promise<{ ok: true; data: GuestData } | { ok: false; code: string }> {
  try {
    const r = await fetch(`${cfg.apiBase}/api/public/guest/signup`, {
      method: 'POST',
      headers: headers(cfg),
      body: JSON.stringify({ businessId: cfg.businessId, ...c }),
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
  p: { businessServiceId: number; startDate: string; bookedById: number; resourceId?: number },
  token: string | null,
): Promise<{ ok: true; data: any } | { ok: false; code: string }> {
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

export const formatDuration = (m: number) =>
  m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`
