import type { Resource, Service } from '../api'
import { effectiveForWorker, formatDuration, formatPrice2, priceRange } from '../api'
import { SelectCard } from '../ui/SelectCard'
import { Clock } from '../ui/icons'

type ResChoice = number | 'any'

export function StepResource({
  workers,
  service,
  selected,
  onPick,
}: {
  // Only the workers who actually offer this service.
  workers: Resource[]
  service: Service
  selected: ResChoice | null
  onPick: (r: ResChoice) => void
}) {
  const { min, max } = priceRange(service, workers)
  const priceVaries = min !== max
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
            meta={
              <span class="vz-price">{priceVaries ? 'od ' : ''}{formatPrice2(min)}</span>
            }
          />
        )}
        {workers.map((w) => {
          const eff = effectiveForWorker(service, w.id)
          return (
            <SelectCard
              avatar={w.image ? <img src={w.image} alt="" /> : w.name.charAt(0)}
              title={w.name}
              sub={w.position || undefined}
              meta={
                <>
                  <span class="vz-dur"><Clock size={14} /> {formatDuration(eff.duration)}</span>
                  <span class="vz-price">{formatPrice2(eff.price)}</span>
                </>
              }
              selected={selected === w.id}
              onSelect={() => onPick(w.id)}
            />
          )
        })}
      </div>
    </div>
  )
}
