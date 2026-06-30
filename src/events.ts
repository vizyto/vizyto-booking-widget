// Consumer-facing analytics events. Every meaningful step of the booking funnel
// emits one, so a host page can wire conversions (GA4 / GTM / Meta Pixel / its
// own backend) without us knowing anything about their stack. Each event is
// delivered four ways, all opt-out-able, so whatever the consumer already has
// wired just works:
//
//   1. VizytoBooking.on(type, handler)        — programmatic subscription
//   2. window 'vizyto:<type>' + 'vizyto:event' CustomEvent (detail = payload)
//   3. config.onEvent(e)                       — a callback passed to mount()
//   4. window.dataLayer.push({ event: 'vizyto_<type>', ... })  — GTM/GA (unless dataLayer:false)
//
// The conversion you almost certainly care about is `booking_completed`: it
// carries appointmentId plus `value`/`currency` in GA4-ecommerce shape.

export type VizytoEventType =
  | 'ready' // business loaded, widget interactive
  | 'open' // modal opened (launcher) — carries { source }
  | 'close' // modal closed
  | 'service_selected'
  | 'specialist_selected'
  | 'datetime_selected'
  | 'details_started' // reached the contact-details step
  | 'otp_sent'
  | 'otp_verified'
  | 'authenticated' // signed in — carries { method }
  | 'booking_submitted' // reservation POST fired
  | 'booking_completed' // reservation confirmed — THE conversion
  | 'booking_failed'
  | 'slot_lost' // chosen slot was taken before confirm

export type VizytoEvent = {
  type: VizytoEventType
  businessId: number
  ts: number // epoch ms
  [k: string]: unknown
}

export type EventHandler = (e: VizytoEvent) => void

// Shared across every mounted instance; events carry businessId so a consumer
// running two widgets on one page can tell them apart.
const listeners = new Map<string, Set<EventHandler>>()

export function on(type: VizytoEventType | '*', handler: EventHandler): () => void {
  let set = listeners.get(type)
  if (!set) listeners.set(type, (set = new Set()))
  set.add(handler)
  return () => off(type, handler)
}

export function off(type: VizytoEventType | '*', handler: EventHandler): void {
  listeners.get(type)?.delete(handler)
}

function dispatch(e: VizytoEvent) {
  for (const h of listeners.get(e.type) ?? []) {
    try {
      h(e)
    } catch (err) {
      console.error('[vizyto] event handler threw', err)
    }
  }
  for (const h of listeners.get('*') ?? []) {
    try {
      h(e)
    } catch (err) {
      console.error('[vizyto] event handler threw', err)
    }
  }
}

export type EmitFn = (type: VizytoEventType, payload?: Record<string, unknown>) => void

export type EmitterContext = {
  businessId: number
  onEvent?: EventHandler
  dataLayer?: boolean // default true: also push to window.dataLayer for GTM/GA
}

// Builds an emit() bound to one instance's context. Cheap to call from render
// handlers — it never throws into the booking flow.
export function createEmitter(ctx: EmitterContext): EmitFn {
  return (type, payload) => {
    const e: VizytoEvent = { type, businessId: ctx.businessId, ts: Date.now(), ...payload }

    dispatch(e)

    if (ctx.onEvent) {
      try {
        ctx.onEvent(e)
      } catch (err) {
        console.error('[vizyto] onEvent threw', err)
      }
    }

    try {
      window.dispatchEvent(new CustomEvent(`vizyto:${type}`, { detail: e }))
      window.dispatchEvent(new CustomEvent('vizyto:event', { detail: e }))
    } catch {}

    if (ctx.dataLayer !== false) {
      try {
        const dl = ((window as any).dataLayer = (window as any).dataLayer || [])
        dl.push({ event: `vizyto_${type}`, ...e })
      } catch {}
    }
  }
}

// No-op emitter, so call sites can stay unconditional when no context is wired.
export const noopEmit: EmitFn = () => {}
