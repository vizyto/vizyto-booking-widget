import type { Resource } from '../api'
import { formatPrice2, rentalUnitsLabel } from '../api'
import { SelectCard } from '../ui/SelectCard'
import { Users } from '../ui/icons'

/** One card = one rentable OFFER, which is not the same as one row in the database. */
export type RentalOption = {
  /** Head unit: the one whose config (unit, price, min/max) describes the offer. */
  head: Resource
  /** Every unit behind the card - 1 for an exposed instance, N for a pool. */
  members: Resource[]
  /** Pool card = the server assigns a free unit; the customer never picks one. */
  pooled: boolean
}

/**
 * Group the flat rentables list into offers.
 *
 * The profile page in Vizyto already does exactly this, but the WEB rental wizard
 * does NOT - it lists ten identical lanes as ten rows, which is the complaint that
 * started the whole pool rework. The widget does it right from the first release:
 * 'pool' and 'choice' collapse into one card per type, 'unit' stays per instance.
 */
export function groupRentables(resources: Resource[]): RentalOption[] {
  const rentables = resources.filter((r) => r.isRentable)
  const out: RentalOption[] = []
  const byType = new Map<number, Resource[]>()
  for (const r of rentables) {
    const exposure = r.rentalUnitExposure ?? 'unit'
    if (exposure === 'unit' || r.rentalTypeId == null) {
      out.push({ head: r, members: [r], pooled: false })
      continue
    }
    const list = byType.get(r.rentalTypeId) ?? []
    list.push(r)
    byType.set(r.rentalTypeId, list)
  }
  for (const members of byType.values()) {
    const head = members[0]!
    out.push({ head, members, pooled: true })
  }
  return out
}

export function StepRentalItem({
  options,
  selectedKey,
  onPick,
}: {
  options: RentalOption[]
  selectedKey: string | null
  onPick: (o: RentalOption) => void
}) {
  if (options.length === 0) {
    return (
      <div class="vz-noslots">
        <div class="vz-muted">Ten salon nie ma nic do wynajęcia.</div>
      </div>
    )
  }
  return (
    <div class="vz-list vz-stagger" role="radiogroup" aria-label="Wybierz przedmiot">
      {options.map((o) => {
        const unit = o.head.rentalUnit ?? 'hour'
        const min = Math.max(1, o.head.rentalMinUnits ?? 1)
        const tier = (o.head.pricingTiers ?? [])[0]
        const rate = tier?.unitPrice ?? o.head.rentalRate ?? null
        return (
          <SelectCard
            key={rentalOptionKey(o)}
            thumb={o.head.image ?? null}
            // A pool is the TYPE, not the instance: "Tor", never "Tor 1 z 10".
            title={o.pooled ? (o.head.rentalTypeName ?? o.head.name) : o.head.name}
            sub={o.pooled ? `Przydzielimy wolny egzemplarz (${o.members.length} szt.)` : (o.head.rentalTypeName ?? undefined)}
            selected={selectedKey === rentalOptionKey(o)}
            onSelect={() => onPick(o)}
            meta={
              <>
                {rate != null && (
                  <span class="vz-price">{formatPrice2(rate)} / {rentalUnitsLabel(1, unit).replace('1 ', '')}</span>
                )}
                <span class="vz-dur">od {rentalUnitsLabel(min, unit)}</span>
                {o.head.rentalMaxPartySize != null && (
                  <span class="vz-dur"><Users size={14} /> do {o.head.rentalMaxPartySize} os.</span>
                )}
              </>
            }
          />
        )
      })}
    </div>
  )
}

/** Stable identity of an offer: the pool key for a pool, the instance otherwise. */
export const rentalOptionKey = (o: RentalOption) =>
  o.pooled ? `t${o.head.rentalTypeId}` : `r${o.head.id}`
