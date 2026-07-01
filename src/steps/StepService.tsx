import { useMemo, useState } from 'preact/hooks'
import type { Resource, Service, ServiceCategory } from '../api'
import { formatDuration, formatPrice2, priceRange } from '../api'
import { SelectCard } from '../ui/SelectCard'
import { Clock } from '../ui/icons'

export function StepService({
  services,
  workers,
  categories = [],
  selectedId,
  onPick,
}: {
  services: Service[]
  // The whole team; each service resolves its own offering workers to decide
  // whether the price varies (per-employee overrides) and show "od" (from).
  workers: Resource[]
  // Optional category grouping; when present, a tab bar filters the list.
  categories?: ServiceCategory[]
  selectedId?: number
  onPick: (s: Service) => void
}) {
  // Resolve each category to the service objects it actually contains (and that
  // are still bookable), dropping empty categories.
  const cats = useMemo(() => {
    const byId = new Map(services.map((s) => [s.id, s]))
    return categories
      .map((c) => ({ id: c.id, name: c.name, items: c.serviceIds.map((id) => byId.get(id)).filter((s): s is Service => !!s) }))
      .filter((c) => c.items.length > 0)
  }, [services, categories])

  const [active, setActive] = useState<number | 'all'>('all')
  const shown = active === 'all' ? services : cats.find((c) => c.id === active)?.items ?? services

  return (
    <div class="vz-fade-in">
      {cats.length > 0 && (
        <div class="vz-cats" role="tablist" aria-label="Kategorie usług">
          <button class={`vz-cat${active === 'all' ? ' on' : ''}`} role="tab" aria-selected={active === 'all'} onClick={() => setActive('all')} type="button">
            Wszystkie
          </button>
          {cats.map((c) => (
            <button class={`vz-cat${active === c.id ? ' on' : ''}`} role="tab" aria-selected={active === c.id} onClick={() => setActive(c.id)} type="button">
              {c.name}
            </button>
          ))}
        </div>
      )}
      <div class="vz-list vz-stagger">
        {shown.map((s) => {
          const { min, max } = priceRange(s, workers)
          const from = min !== max
          return (
            <SelectCard
              title={s.name}
              selected={s.id === selectedId}
              onSelect={() => onPick(s)}
              meta={
                <>
                  <span class="vz-dur"><Clock size={14} /> {formatDuration(s.duration)}</span>
                  <span class="vz-price">{from ? 'od ' : ''}{formatPrice2(min)}</span>
                </>
              }
            />
          )
        })}
      </div>
    </div>
  )
}
