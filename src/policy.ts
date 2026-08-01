// Cart-wide cancellation terms: the strictest position wins.
//
// Port of the server rule in
// apps/api/src/modules/appointments/services/cancellation-policy.ts. Cancelling
// is atomic for the whole appointment - one cart books one chain - so the terms
// the customer is shown before confirming must be the conjunction of every
// position's terms. Any softer rule is trivially gamed: a 48 h colouring becomes
// cancellable an hour before as soon as a 0 h service joins the cart.
//
// The API hands over the RAW per-service override (null = inherit that field),
// never a resolved policy, so the two rules below are the whole of it:
//   - the business flag is a hard switch - a service can tighten, never unlock
//   - window = MAX over positions, each position falling back to the business
//     window when it does not state its own

import type { BookingPolicy, Service } from './api'

export function resolveCartPolicy(cartServices: Service[], fallback: BookingPolicy): BookingPolicy
export function resolveCartPolicy(cartServices: Service[], fallback: BookingPolicy | undefined): BookingPolicy | undefined
export function resolveCartPolicy(cartServices: Service[], fallback?: BookingPolicy): BookingPolicy | undefined {
  // No published terms (older API snapshot) - nothing to state, and nothing to
  // fall back to per position either.
  if (!fallback) return undefined
  // An empty cart would turn the MAX below into 0 h ("odwołasz do początku
  // wizyty"), which is a promise the business never made.
  if (!cartServices.length) return fallback

  let allowCancellation = fallback.allowCancellation
  let cancellationHoursBefore = 0
  for (const s of cartServices) {
    const p = s.cancellationPolicy
    // `null` (and an absent override) inherit the business answer, which is
    // already the seed of `allowCancellation`; only an explicit false tightens.
    if (p?.allowCancellation === false) allowCancellation = false
    const hours = p?.cancellationHoursBefore ?? fallback.cancellationHoursBefore
    if (hours > cancellationHoursBefore) cancellationHoursBefore = hours
  }
  return { ...fallback, allowCancellation, cancellationHoursBefore }
}
