import type { Availability } from '../api'

export function AvailabilityBadge({ availability }: { availability: Availability }) {
  if (availability === 'available') return null
  return (
    <span class={`vz-lock-chip${availability === 'last_spots' ? ' warning' : ''}`}>
      {availability === 'full' ? 'Brak miejsc' : 'Ostatnie miejsca'}
    </span>
  )
}
