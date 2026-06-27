import type { Resource, Service } from '../api'
import { formatDuration, formatPrice2 } from '../api'
import { SelectCard } from '../ui/SelectCard'
import { Clock } from '../ui/icons'

type ResChoice = number | 'any'

export function StepResource({
  workers,
  service,
  selected,
  onPick,
}: {
  workers: Resource[]
  service: Service
  selected: ResChoice | null
  onPick: (r: ResChoice) => void
}) {
  const meta = (
    <>
      <span class="vz-dur"><Clock size={14} /> {formatDuration(service.duration)}</span>
      <span class="vz-price">{formatPrice2(service.price)}</span>
    </>
  )
  return (
    <div class="vz-fade-in">
      <div class="vz-list vz-stagger">
        {workers.length > 1 && (
          <SelectCard
            avatar="✦"
            title="Dowolny specjalista"
            sub="najszybszy wolny termin"
            selected={selected === 'any'}
            onSelect={() => onPick('any')}
          />
        )}
        {workers.map((w) => (
          <SelectCard
            avatar={w.image ? <img src={w.image} alt="" /> : w.name.charAt(0)}
            title={w.name}
            sub={w.position || undefined}
            meta={meta}
            selected={selected === w.id}
            onSelect={() => onPick(w.id)}
          />
        ))}
      </div>
    </div>
  )
}
