import type { Service } from '../api'
import { formatDuration, formatPrice2 } from '../api'
import { SelectCard } from '../ui/SelectCard'
import { Clock } from '../ui/icons'

export function StepService({
  services,
  selectedId,
  onPick,
}: {
  services: Service[]
  selectedId?: number
  onPick: (s: Service) => void
}) {
  return (
    <div class="vz-fade-in">
      <div class="vz-list vz-stagger">
        {services.map((s) => (
          <SelectCard
            title={s.name}
            selected={s.id === selectedId}
            onSelect={() => onPick(s)}
            meta={
              <>
                <span class="vz-dur"><Clock size={14} /> {formatDuration(s.duration)}</span>
                <span class="vz-price">od {formatPrice2(s.price)}</span>
              </>
            }
          />
        ))}
      </div>
    </div>
  )
}
