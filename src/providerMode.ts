// How the customer picks who performs a multi-service cart.
//
// The API has carried `resourceId` PER cart position from day one, but the
// widget used to stamp one choice onto all of them, so a customer booking three
// services either accepted one person for everything or left it all to us.
// These helpers are the shared vocabulary for the three modes:
//
//   'any'    - no preference, the server assigns per position (maximum availability)
//   'single' - ONE person performs every position (only those who can, are listed)
//   'each'   - a separate choice per position; "no preference" stays legal per item
//
// This is a hand port of packages/shared/src/utils/booking-provider.ts from the
// monorepo: the widget is a standalone bundle and cannot import from it, but the
// three surfaces (WEB, CLIENT, widget) must agree on what a mode means. Keep the
// names and the semantics identical when either side changes.

import type { Resource, Service } from './api'
import { workerOffersService } from './api'

export type ProviderMode = 'any' | 'single' | 'each'

/**
 * One cart position, as far as the provider question is concerned.
 * resourceId: undefined = not chosen yet, null = "no preference", number = pinned.
 */
export type ProviderItem = { service: Service; resourceId?: number | null }

/**
 * Who fulfils ONE position: a worker the customer may pick ('staff'), an object
 * from a pool ('unit'), or the server's own choice ('auto', providerSelection).
 *
 * A worker id must NEVER be written onto a 'unit' or 'auto' position: the engine
 * then has an empty candidate set and answers with zero slots for the whole day,
 * which reads as a silently empty calendar.
 */
export function getItemProviderMode(service: Service): 'staff' | 'unit' | 'auto' {
  if (service?.providerSelection === 'auto') return 'auto'
  return service?.fulfillmentMode === 'unit' ? 'unit' : 'staff'
}

/**
 * True when the resource performs the service. A service with no per-resource
 * assignment rows is performed by anyone (that is the authoring default, not an
 * empty team) - same rule as workerOffersService, named as in the monorepo.
 */
export function resourcePerformsService(service: Service, resourceId: number): boolean {
  return workerOffersService(service, resourceId)
}

/** Positions the customer may pick a WORKER for ('unit'/'auto' are decided elsewhere). */
export function getStaffItems<T extends ProviderItem>(items: T[]): T[] {
  return items.filter((it) => getItemProviderMode(it.service) === 'staff')
}

/** Workers the customer may pick for ONE service. */
export function getResourcesForService(resources: Resource[], service: Service): Resource[] {
  return (resources || []).filter((r) => r.isCustomerSelectable !== false && resourcePerformsService(service, r.id))
}

/** Workers who can perform EVERY position - the candidates for the 'single' mode. */
export function getResourcesForAllItems(resources: Resource[], items: ProviderItem[]): Resource[] {
  const staffItems = getStaffItems(items)
  if (!staffItems.length) return []
  return (resources || []).filter(
    (r) => r.isCustomerSelectable !== false && staffItems.every((it) => resourcePerformsService(it.service, r.id)),
  )
}

/**
 * Which mode the current cart is in.
 *
 * 'each' cannot be derived from the data alone: a per-position cart where every
 * position is still "no preference" looks exactly like 'any'. So the mode the
 * customer picked is carried explicitly (a flag in flow state) and only the
 * concrete shapes are derived.
 */
export function deriveProviderMode(items: ProviderItem[], explicitEach = false): ProviderMode {
  const staffItems = getStaffItems(items)
  const pinned = staffItems.filter((it) => typeof it.resourceId === 'number')
  // A single pinned person on every position IS 'single', even mid-'each':
  // the customer ended up at the same place, and the summary must say so.
  const allSamePerson =
    pinned.length > 0 &&
    pinned.length === staffItems.length &&
    pinned.every((it) => it.resourceId === pinned[0]!.resourceId)
  if (allSamePerson && !explicitEach) return 'single'
  if (explicitEach) return 'each'
  return pinned.length > 0 ? 'single' : 'any'
}

/**
 * Per-position mode makes sense only when the customer would actually get a
 * different answer than "one person for everything": at least two positions the
 * customer picks a worker for, and at least one of them with a real choice.
 */
export function canPickPerItem(items: ProviderItem[], resources: Resource[]): boolean {
  const staffItems = getStaffItems(items)
  if (staffItems.length < 2) return false
  return staffItems.some((it) => getResourcesForService(resources, it.service).length > 0)
}

/** Write ONE choice onto every position ('single' when a resource is given, 'any' when null). */
export function setAllItemResources<T extends ProviderItem>(items: T[], resourceId: number | null): T[] {
  return items.map((it) => ({ ...it, resourceId }))
}

/**
 * Enter per-position mode. Positions the customer has not touched default to
 * "bez preferencji" instead of staying undefined - an unset position would read
 * as "not chosen yet" and block the step.
 */
export function enterPerItemMode<T extends ProviderItem>(items: T[]): T[] {
  return items.map((it) => {
    if (getItemProviderMode(it.service) !== 'staff') return it
    return typeof it.resourceId === 'number' ? it : { ...it, resourceId: null }
  })
}

/** Write the choice for ONE position, keyed by service id. */
export function setItemResource<T extends ProviderItem>(items: T[], serviceId: number, resourceId: number | null): T[] {
  return items.map((it) => (it.service.id === serviceId ? { ...it, resourceId } : it))
}

/** Drop every worker pin, leaving each staff position at "bez preferencji". */
export function clearStaffPins<T extends ProviderItem>(items: T[]): T[] {
  return items.map((it) => (getItemProviderMode(it.service) === 'staff' ? { ...it, resourceId: null } : it))
}

/**
 * Distinct people pinned across the cart, in position order - the source for the
 * summary chip (one name vs an avatar stack + "Wielu specjalistów").
 */
export function getPinnedResourceIds(items: ProviderItem[]): number[] {
  const seen: number[] = []
  for (const it of items) {
    if (typeof it.resourceId === 'number' && !seen.includes(it.resourceId)) seen.push(it.resourceId)
  }
  return seen
}

/**
 * A pinned worker who no longer performs the cart they are pinned to would
 * dead-end the time step. Returns the cart with such pins dropped, plus what was
 * dropped so the caller can say it out loud instead of silently re-picking.
 */
export function dropInvalidPins<T extends ProviderItem>(
  items: T[],
  mode: ProviderMode,
): { items: T[]; droppedResourceIds: number[] } {
  const dropped: number[] = []
  const next = items.map((it) => {
    if (typeof it.resourceId !== 'number') return it
    if (getItemProviderMode(it.service) !== 'staff') return it
    if (resourcePerformsService(it.service, it.resourceId)) return it
    if (!dropped.includes(it.resourceId)) dropped.push(it.resourceId)
    // Per-position mode only loses the colliding position; one-for-all loses the
    // whole choice, because the point of it was one person for everything.
    return { ...it, resourceId: mode === 'each' ? null : undefined }
  })
  if (!dropped.length) return { items, droppedResourceIds: [] }
  return {
    items: mode === 'each' ? next : next.map((it) => ({ ...it, resourceId: undefined })),
    droppedResourceIds: dropped,
  }
}
