import type { Resource, Service } from '../api'
import { effectiveForWorker, formatDuration, formatPrice2, priceRange } from '../api'
import { SelectCard } from '../ui/SelectCard'
import { Clock } from '../ui/icons'

type ResChoice = number | 'any'

// Provider pick step. 'staff' lists the workers who offer the service (with
// per-employee price/duration); 'unit' lists the objects in the service's
// primary pool (loża, tor, stanowisko) - all at the service price. Both offer a
// "Dowolny" option that lets the server assign the first free provider.
export function StepResource({
  providers,
  service,
  mode,
  anyLabel,
  selected,
  onPick,
}: {
  providers: Resource[]
  service: Service
  mode: 'staff' | 'unit'
  // Label of the "Dowolny ..." option (specialist vs pool type).
  anyLabel: string
  selected: ResChoice | null
  onPick: (r: ResChoice) => void
}) {
  const { min, max } = priceRange(service, providers)
  const priceVaries = min !== max
  return (
    <div class="vz-fade-in">
      <div class="vz-list vz-stagger" role="radiogroup" aria-label={mode === 'unit' ? 'Wybór zasobu' : 'Wybór specjalisty'}>
        {providers.length > 1 && (
          <SelectCard
            avatar="✦"
            title={anyLabel}
            sub="najszybszy wolny termin"
            selected={selected === 'any'}
            onSelect={() => onPick('any')}
            meta={mode === 'staff' ? <span class="vz-price">{priceVaries ? 'od ' : ''}{formatPrice2(min)}</span> : undefined}
          />
        )}
        {providers.map((p) => {
          if (mode === 'unit') {
            return (
              <SelectCard
                avatar={p.image ? <img src={p.image} alt="" /> : p.name.charAt(0)}
                title={p.name}
                sub={p.position || undefined}
                selected={selected === p.id}
                onSelect={() => onPick(p.id)}
              />
            )
          }
          const eff = effectiveForWorker(service, p.id)
          return (
            <SelectCard
              avatar={p.image ? <img src={p.image} alt="" /> : p.name.charAt(0)}
              title={p.name}
              sub={p.position || undefined}
              meta={
                <>
                  <span class="vz-dur"><Clock size={14} /> {formatDuration(eff.duration)}</span>
                  <span class="vz-price">{formatPrice2(eff.price)}</span>
                </>
              }
              selected={selected === p.id}
              onSelect={() => onPick(p.id)}
            />
          )
        })}
      </div>
    </div>
  )
}
