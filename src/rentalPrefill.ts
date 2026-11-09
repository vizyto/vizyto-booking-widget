// Which rental offer a host page's prefill opens straight onto.
//
// Kept free of JSX (a type-only import of RentalOption) so bun can test it
// directly, like ./tables.

import type { RentalOption } from './steps/StepRentalItem'

/**
 * The offer a prefill names, or null for the ordinary list.
 *
 * - `rentalTypeId` names a POOL ('pool' or 'choice' exposure): the pool card of
 *   that type, whose calendar the server books from a free unit. An unknown type,
 *   or a type exposed per unit, falls through to `resourceId`.
 * - `resourceId` names one exposed instance (a vehicle card on a rental company's
 *   page). A pool member's id alone still leaves the list, as the README says: the
 *   customer never picks a unit inside a pool.
 */
export function initialRentalOption(
  options: RentalOption[],
  prefill?: { resourceId?: number; rentalTypeId?: number },
): RentalOption | null {
  if (prefill?.rentalTypeId != null) {
    const pool = options.find((o) => o.pooled && o.head.rentalTypeId === prefill.rentalTypeId)
    if (pool) return pool
  }
  if (prefill?.resourceId != null) {
    return options.find((o) => !o.pooled && o.head.id === prefill.resourceId) ?? null
  }
  return null
}
