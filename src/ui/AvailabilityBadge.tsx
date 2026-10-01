import type { Availability } from '../api'

/**
 * Seat chip as CLIENT and WEB show it (shared `spotsChipLabel` and `SessionRow`):
 * a class names its last free seats at three or fewer, a term only says it is full.
 */
export function AvailabilityBadge({ availability, spotsLeft }: { availability: Availability; spotsLeft?: number | null }) {
  if (availability === 'full') return <span class="vz-lock-chip">Brak miejsc</span>
  if (spotsLeft == null || spotsLeft < 1 || spotsLeft > 3) return null
  return <span class="vz-lock-chip warning">{spotsLeft === 1 ? 'Ostatnie miejsce' : `Ostatnie ${spotsLeft} miejsca`}</span>
}
