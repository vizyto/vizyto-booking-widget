import type { TableOptions } from '../tables'
import { partyRange } from '../tables'
import { MapPin, Users } from '../ui/icons'

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)

/**
 * "Liczba osób" for a table (#903 F11), the WEB PartyStep in widget form: adults and
 * children within the venue's limits and, with two or more zones, the zone the venue
 * will try to seat the party in. Pills rather than a stepper - the widget has no
 * stepper, and the rental "Ile osób?" row already reads this way.
 *
 * Renders with the API's limits while the options load; `null` options (a failed
 * read) keep those limits and simply show no zone chips.
 */
export function StepTableParty({
  options,
  adults,
  children,
  zoneId,
  onAdults,
  onChildren,
  onZone,
}: {
  options: TableOptions | null | undefined
  adults: number
  children: number
  zoneId: number | null
  onAdults: (n: number) => void
  onChildren: (n: number) => void
  onZone: (id: number | null) => void
}) {
  const { maxAdults, maxChildren } = partyRange(options)
  const zones = options?.zones ?? []

  const pills = (labelId: string, values: number[], value: number, onPick: (n: number) => void) => (
    <div class="vz-pills" role="radiogroup" aria-labelledby={labelId}>
      {values.map((n) => (
        <button
          class={`vz-pill${n === value ? ' on' : ''}`}
          onClick={() => onPick(n)}
          role="radio"
          aria-checked={n === value ? 'true' : 'false'}
          type="button"
        >
          {n}
        </button>
      ))}
    </div>
  )

  return (
    <div class="vz-stack vz-fade-in">
      <div class="vz-field">
        <div class="vz-label" id="vz-table-adults"><Users size={15} /> Dorośli</div>
        {pills('vz-table-adults', range(1, maxAdults), adults, onAdults)}
      </div>
      <div class="vz-field">
        <div class="vz-label" id="vz-table-children"><Users size={15} /> Dzieci</div>
        {pills('vz-table-children', range(0, maxChildren), children, onChildren)}
      </div>
      {zones.length >= 2 && (
        <div class="vz-field">
          <div class="vz-label" id="vz-table-zone"><MapPin size={15} /> Strefa</div>
          <div class="vz-pills" role="radiogroup" aria-labelledby="vz-table-zone">
            <button
              class={`vz-pill${zoneId == null ? ' on' : ''}`}
              onClick={() => onZone(null)}
              role="radio"
              aria-checked={zoneId == null ? 'true' : 'false'}
              type="button"
            >
              Dowolna strefa
            </button>
            {zones.map((z) => (
              <button
                class={`vz-pill${zoneId === z.id ? ' on' : ''}`}
                onClick={() => onZone(z.id)}
                role="radio"
                aria-checked={zoneId === z.id ? 'true' : 'false'}
                type="button"
              >
                {z.name}
              </button>
            ))}
          </div>
          <div class="vz-muted">Lokal postara się o stolik w wybranej strefie.</div>
        </div>
      )}
    </div>
  )
}
