/**
 * Per-channel booking policy (vizyto #680), the widget's slice of it.
 *
 * The business decides, per channel, whether online booking is on and which
 * customer actions it takes. On an external site the widget books in the channel
 * `widget` ("Twoja strona WWW" in PRO - the same channel as a site from the
 * builder). vizyto.com's own guest page (/r/) mounts it with `channel: 'website'`
 * and no site key, and that traffic books in the channel `website` ("vizyto.com").
 * The API picks the channel from the request Origin and refuses a write the
 * policy does not allow with 409 CHANNEL_BOOKING_DISABLED /
 * CHANNEL_ACTION_DISABLED; the widget only reads the slice of the configured
 * channel (`cfg.channel`). CLIENT and WEB read the resolved policy from the
 * public business profile and never start a flow the server will refuse; this
 * file lets the widget do the same.
 *
 * `publicChannelAllows` is a faithful port of the function of the same name in
 * the monorepo's `packages/shared/src/utils/bookingChannels.ts` (like ./policy
 * and ./providerMode, the widget keeps a local copy because it is built and
 * released on its own). Keep the two in step.
 */

export type BookingChannel = 'website' | 'client_app' | 'widget'

/** Customer actions the policy knows (`CUSTOMER_ACTIONS` in the monorepo). */
export type CustomerAction = 'book' | 'groupClasses' | 'rentals' | 'waitlist' | 'reschedule' | 'cancel'

/** The per-channel slice of the public business profile (`PublicBookingChannels`). */
export type PublicBookingChannels = Partial<
  Record<BookingChannel, { enabled: boolean; actions: Partial<Record<CustomerAction, boolean>> }>
>

/** The channels the widget can be mounted in (`client_app` is the CLIENT app only). */
export type WidgetChannel = Extract<BookingChannel, 'widget' | 'website'>

/** The channel of an external site (the site-key path), and the default. */
export const WIDGET_CHANNEL: WidgetChannel = 'widget'

/**
 * The `channel` mount option: `website` for vizyto.com's own guest page, anything
 * else (missing, a typo, `client_app`) is the external-site channel `widget`.
 */
export function resolveWidgetChannel(value: unknown): WidgetChannel {
  return value === 'website' ? 'website' : WIDGET_CHANNEL
}

/**
 * What a customer surface may offer, read from the public business profile. An
 * API without `bookingChannels` (an older server) falls back to the business-wide
 * switch for visits and keeps everything else open, which is what it did before
 * #680.
 */
export function publicChannelAllows(
  business: { hasWebsiteReservationsEnabled?: boolean | null; bookingChannels?: PublicBookingChannels | null } | null | undefined,
  channel: BookingChannel,
  action: CustomerAction,
): boolean {
  if (!business) return false
  const slice = business.bookingChannels?.[channel]
  if (slice) return slice.actions[action] ?? false
  return action === 'book' ? !!business.hasWebsiteReservationsEnabled : true
}

/**
 * The refusal codes of the monorepo's booking-channels policy service: the
 * channel's online booking is off (CHANNEL_BOOKING_DISABLED) or this one action
 * is (CHANNEL_ACTION_DISABLED). Both are a business decision, not a race, so the
 * customer must not be told to pick another term.
 */
export const CHANNEL_REFUSAL_CODES: ReadonlySet<string> = new Set(['CHANNEL_BOOKING_DISABLED', 'CHANNEL_ACTION_DISABLED'])

/**
 * Refusals of the whole business, whatever the term: it stopped taking customers
 * (BUSINESS_CLOSED, a 409) or has no serving plan (SUBSCRIPTION_REQUIRED, a 402).
 * With the channel pair above these are the monorepo's
 * VISIT_BUSINESS_REFUSAL_CODES (packages/shared/src/utils/bookingErrorMessages.ts):
 * another hour gets the same answer, so they are never a lost slot.
 */
export const BUSINESS_REFUSAL_CODES: ReadonlySet<string> = new Set(['BUSINESS_CLOSED', 'SUBSCRIPTION_REQUIRED'])

const VERIFICATION_CODES: ReadonlySet<string> = new Set([
  'BOOKED_BY_MISMATCH',
  'VERIFICATION_REQUIRED',
  'PHONE_VERIFICATION_REQUIRED',
])

/**
 * Codes of a request the API could not take as sent, never a refusal of the
 * term: a body it could not read (Elysia's parse and validation errors, the
 * monorepo's REQUEST_REJECTED_CODES), a site key it does not accept, and an
 * Idempotency-Key already used for another booking.
 */
const REQUEST_FAILURE_CODES: ReadonlySet<string> = new Set([
  'PARSE', 'VALIDATION', 'INVALID_PARAMETER', 'INVALID_COOKIE_SIGNATURE', 'SITE_KEY_REQUIRED', 'IDEMPOTENCY_KEY_REUSED',
])

/**
 * How the flow answers a refused write. Shared by the visit, class, rental and
 * table create paths so a code means the same thing in all of them:
 *  - `price_changed`: show the new price and ask again (needs the new quote),
 *  - `verification`: back to identity, the session no longer passes,
 *  - `access_restricted`: the whitelist gate refused this viewer,
 *  - `channel_closed`: the business does not take this booking in the
 *    configured channel any more - the closed state, never "this term is gone",
 *  - `business_closed`: the business takes no new bookings at all now (closed,
 *    no serving plan) - the closed state for everything, never "this term is gone",
 *  - `network`: keep everything and offer a retry,
 *  - `failed`: no refusal the flow can name (a server error, a body without the
 *    API's code, a request the API could not take): keep everything and offer a
 *    retry; nothing of the answer reaches the customer,
 *  - `refused`: anything else; each path keeps its own recovery (slot lost for a
 *    visit when `isSlotRefusal`, the reason named on the timetable or the rental
 *    calendar).
 */
export type WriteFailure =
  | 'price_changed' | 'verification' | 'access_restricted' | 'channel_closed' | 'business_closed' | 'network' | 'failed' | 'refused'

/** Actions that start a new booking (`NEW_BOOKING_ACTIONS` in the monorepo). */
export const NEW_BOOKING_ACTIONS: readonly CustomerAction[] = ['book', 'groupClasses', 'rentals', 'waitlist']

/**
 * What a channel refusal of `action` tells us is closed now, mirroring
 * `channelRefusal` in the monorepo's booking-channels policy.service.ts:
 *  - CHANNEL_ACTION_DISABLED: this one action;
 *  - CHANNEL_BOOKING_DISABLED for a visit: the channel's online booking is off,
 *    which on its own closes visits only (the business switch never covered
 *    classes, rentals or the waitlist);
 *  - CHANNEL_BOOKING_DISABLED for anything else: the channel itself was switched
 *    off, which stops every new booking.
 */
export function refusedActions(action: CustomerAction, code: string): CustomerAction[] {
  if (code === 'CHANNEL_BOOKING_DISABLED' && action !== 'book') return [...NEW_BOOKING_ACTIONS]
  return [action]
}

/**
 * `status` is the HTTP status of the answer; a result without one (the mock) is
 * read by its code alone.
 */
export function classifyWriteFailure(r: { code: string; status?: number; pricing?: unknown }): WriteFailure {
  if (r.code === 'NETWORK') return 'network'
  // A server error is never a refusal, whatever its body says.
  if (r.status != null && r.status >= 500) return 'failed'
  if (r.code === 'PRICE_CHANGED' && r.pricing) return 'price_changed'
  if (VERIFICATION_CODES.has(r.code)) return 'verification'
  if (r.code === 'BOOKING_ACCESS_RESTRICTED') return 'access_restricted'
  if (CHANNEL_REFUSAL_CODES.has(r.code)) return 'channel_closed'
  if (BUSINESS_REFUSAL_CODES.has(r.code)) return 'business_closed'
  if (REQUEST_FAILURE_CODES.has(r.code)) return 'failed'
  // A body without the API's code (HTTP_<status>: a proxy's error page, a
  // non-JSON answer) refuses nothing, except a 409, which the monorepo reads as a
  // refused slot too.
  if (/^HTTP_\d+$/.test(r.code) && r.code !== 'HTTP_409') return 'failed'
  return 'refused'
}

/**
 * Codes of a refused visit create that are NOT a lost slot: a faithful port of
 * BOOKING_CREATE_NON_SLOT_CODES and _PREFIXES in the monorepo's
 * packages/shared/src/utils/bookingCreateErrors.ts. Each has its own answer
 * (above, or the reward recovery before it). Keep the two in step.
 */
export const BOOKING_CREATE_NON_SLOT_CODES: ReadonlySet<string> = new Set([
  'PRICE_CHANGED',
  'BUSINESS_CLOSED',
  'CHANNEL_BOOKING_DISABLED',
  'CHANNEL_ACTION_DISABLED',
  'IDEMPOTENCY_KEY_REUSED',
  'BOOKING_ACCESS_RESTRICTED',
  'PHONE_VERIFICATION_REQUIRED',
  'VERIFICATION_REQUIRED',
  'BOOKED_BY_MISMATCH',
  'SITE_KEY_REQUIRED',
  'INCOMPLETE_PROFILE',
  'SUBSCRIPTION_REQUIRED',
])
export const BOOKING_CREATE_NON_SLOT_PREFIXES: readonly string[] = ['REWARD_', 'LOYALTY_', 'PASS_', 'GIFT_CARD_']

/**
 * Whether a refused visit create is a lost slot (`isBookingSlotRefusal` in the
 * monorepo, owner decision #543): every 409 except the codes above, so a new
 * availability code (APPOINTMENT_*) needs no widget release. Any other status is
 * never a lost slot. A result without a status (the mock) is read by its code.
 */
export function isSlotRefusal(r: { code: string; status?: number }): boolean {
  if (r.status != null ? r.status !== 409 : r.code === 'NETWORK') return false
  if (BOOKING_CREATE_NON_SLOT_CODES.has(r.code)) return false
  return !BOOKING_CREATE_NON_SLOT_PREFIXES.some((prefix) => r.code.startsWith(prefix))
}
