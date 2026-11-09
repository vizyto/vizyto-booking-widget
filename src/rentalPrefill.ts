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

/**
 * The offer the rental time step starts on: the one the prefill names, else the
 * only offer there is. A business that rents one thing (one instance or one
 * pool) has no list step, so nothing else would ever pick it: a bare
 * `kind: 'rental'` link, the offering fork and "Nowa rezerwacja" all land on
 * its calendar. With several offers and no hit the list asks, as before.
 *
 * Not folded into initialRentalOption: that one also says the host page chose
 * the rental family, which a business renting one thing next to its services
 * has not.
 */
export function startingRentalOption(
  options: RentalOption[],
  prefill?: { resourceId?: number; rentalTypeId?: number },
): RentalOption | null {
  return initialRentalOption(options, prefill) ?? (options.length === 1 ? options[0]! : null)
}

/** The length a fresh pick starts at: the offer's minimum (one unit without one). */
export const startingRentalUnits = (option: RentalOption | null): number =>
  Math.max(1, option?.head.rentalMinUnits ?? 1)
