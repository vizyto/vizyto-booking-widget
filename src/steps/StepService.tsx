import { useMemo, useState } from 'preact/hooks'
import type { Resource, Service, ServiceCategory } from '../api'
import { formatDuration, formatPrice2, richTextToPlain, serviceBaseRange } from '../api'
import { SelectCard } from '../ui/SelectCard'
import { Clock, Lock, Search } from '../ui/icons'

/** One position already in the cart, as the list needs to render it. */
export type CartEntry = { serviceId: number; recap: string; editable: boolean }

export function StepService({
  services,
  workers,
  categories = [],
  cart,
  onToggle,
  onEdit,
}: {
  services: Service[]
  // The whole team; each service resolves its own offering workers to decide
  // whether the price varies (per-employee overrides) and show "od" (from).
  workers: Resource[]
  // Optional category grouping; when present, a tab bar filters the list.
  categories?: ServiceCategory[]
  /** Cart contents - a service in here renders as selected. */
  cart: CartEntry[]
  onToggle: (s: Service) => void
  /** Reopen a position's variant + add-ons. */
  onEdit: (serviceId: number) => void
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
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()

  const inCategory = active === 'all' ? services : cats.find((c) => c.id === active)?.items ?? services
  // Searching looks across the WHOLE offer - a name the customer types must not
  // stay hidden just because a category tab happens to be active.
  const shown = q ? services.filter((s) => s.name.toLowerCase().includes(q)) : inCategory

  // When any shown service has a photo, render a thumbnail square on every card
  // (photo or a letter placeholder) so the list stays aligned; otherwise keep
  // the clean text-only layout.
  const anyImage = useMemo(() => shown.some((s) => !!s.image), [shown])
  const entryOf = (id: number) => cart.find((c) => c.serviceId === id)

  return (
    <div class="vz-fade-in">
      {services.length > 6 && (
        <label class="vz-search">
          <span class="vz-search-ico"><Search size={16} /></span>
          <input
            class="vz-search-input"
            type="search"
            value={query}
            placeholder="Szukaj usługi"
            aria-label="Szukaj usługi"
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          />
        </label>
      )}

      {cats.length > 0 && !q && (
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

      {shown.length === 0 && (
        <p class="vz-muted" style="padding:12px 2px;">Brak usług pasujących do wyszukiwania.</p>
      )}

      {/* Multi-select: one visit can chain several services, so this is a group
          of checkboxes, not a radio group. */}
      <div class="vz-list vz-stagger" role="group" aria-label="Usługi">
        {shown.map((s) => {
          const { min, from } = serviceBaseRange(s, workers)
          const desc = richTextToPlain(s.description)
          const entry = entryOf(s.id)
          return (
            <div class="vz-cart-row">
              <SelectCard
                multi
                thumb={anyImage ? (s.image ?? null) : undefined}
                title={s.name}
                desc={desc || undefined}
                selected={!!entry}
                onSelect={() => onToggle(s)}
                meta={
                  <>
                    <span class="vz-dur"><Clock size={14} /> {formatDuration(s.duration)}</span>
                    <span class="vz-price">{from ? 'od ' : ''}{formatPrice2(min)}</span>
                    {/* Whitelist-locked: still selectable - logging in may unlock it. */}
                    {s.viewerAccess === 'locked' && (
                      <span class="vz-lock-chip"><Lock size={11} /> Dla stałych klientów</span>
                    )}
                  </>
                }
              />
              {entry && (entry.recap || entry.editable) && (
                <div class="vz-cart-recap">
                  {entry.recap && <span class="vz-cart-recap-t">{entry.recap}</span>}
                  {entry.editable && (
                    <button class="vz-link" type="button" onClick={() => onEdit(s.id)}>
                      Zmień wariant / dodatki
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
