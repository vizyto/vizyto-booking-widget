/**
 * Per-channel booking policy (vizyto #680), the widget's slice of it.
 *
 * The business decides, per channel, whether online booking is on and which
 * customer actions it takes. The widget books in the channel `widget`
 * ("Twoja strona WWW" in PRO - the same channel as a site from the builder), and
 * the API refuses a write the policy does not allow with 409
 * CHANNEL_BOOKING_DISABLED / CHANNEL_ACTION_DISABLED. CLIENT and WEB read the
 * resolved policy from the public business profile and never start a flow the
 * server will refuse; this file lets the widget do the same.
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

/** The channel every widget write is attributed to (the site-key path). */
export const WIDGET_CHANNEL: BookingChannel = 'widget'

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

/** Widget shorthand: may this business take `action` in the widget channel? */
export const widgetAllows = (
  business: Parameters<typeof publicChannelAllows>[0],
  action: CustomerAction,
): boolean => publicChannelAllows(business, WIDGET_CHANNEL, action)

/**
 * The refusal codes of the monorepo's booking-channels policy service: the
 * channel's online booking is off (CHANNEL_BOOKING_DISABLED) or this one action
 * is (CHANNEL_ACTION_DISABLED). Both are a business decision, not a race, so the
 * customer must not be told to pick another term.
 */
export const CHANNEL_REFUSAL_CODES: ReadonlySet<string> = new Set(['CHANNEL_BOOKING_DISABLED', 'CHANNEL_ACTION_DISABLED'])

const VERIFICATION_CODES: ReadonlySet<string> = new Set([
  'BOOKED_BY_MISMATCH',
  'VERIFICATION_REQUIRED',
  'PHONE_VERIFICATION_REQUIRED',
])

/**
 * How the flow answers a refused write. Shared by the visit, class and rental
 * create paths so a code means the same thing in all three:
 *  - `price_changed`: show the new price and ask again (needs the new quote),
 *  - `verification`: back to identity, the session no longer passes,
 *  - `access_restricted`: the whitelist gate refused this viewer,
 *  - `channel_closed`: the business does not take this booking in the widget
 *    channel any more - the closed state, never "this term is gone",
 *  - `network`: keep everything and offer a retry,
 *  - `refused`: anything else; each path keeps its own recovery (slot lost for a
 *    visit, the reason named on the timetable or the rental calendar).
 */
export type WriteFailure = 'price_changed' | 'verification' | 'access_restricted' | 'channel_closed' | 'network' | 'refused'

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

export function classifyWriteFailure(r: { code: string; pricing?: unknown }): WriteFailure {
  if (r.code === 'PRICE_CHANGED' && r.pricing) return 'price_changed'
  if (VERIFICATION_CODES.has(r.code)) return 'verification'
  if (r.code === 'BOOKING_ACCESS_RESTRICTED') return 'access_restricted'
  if (CHANNEL_REFUSAL_CODES.has(r.code)) return 'channel_closed'
  if (r.code === 'NETWORK') return 'network'
  return 'refused'
}
