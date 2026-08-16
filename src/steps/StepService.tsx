import { useMemo, useState } from 'preact/hooks'
import type { Resource, Service, ServiceCategory } from '../api'
import { formatDuration, formatPrice2, richTextToPlain, serviceBaseRange } from '../api'
import { SelectCard } from '../ui/SelectCard'
import { Clock, Info, Lock, Pencil, Plus, Search, Trash } from '../ui/icons'

/** One position already in the cart, as the list needs to render it. */
export type CartEntry = { serviceId: number; recap: string; editable: boolean }

export function StepService({
  services,
  workers,
  categories = [],
  cart,
  onToggle,
  onEdit,
  onDetails,
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
  /** Otwiera szczegóły usługi (galeria + pełny opis). */
  onDetails: (serviceId: number) => void
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
        <p class="vz-muted" style="padding:12px 2px;">
          {q ? 'Brak usług pasujących do wyszukiwania.' : 'Ten salon nie ma jeszcze usług dostępnych online.'}
        </p>
      )}

      {/* Jedna wizyta może łączyć kilka usług, więc to lista dodawania, nie wybór
          jednej opcji: karta działa jak przycisk (dodaj / edytuj), a usuwa kosz. */}
      <div class="vz-list vz-stagger" role="group" aria-label="Usługi">
        {shown.map((s) => {
          const { min, from } = serviceBaseRange(s, workers)
          const desc = richTextToPlain(s.description)
          const entry = entryOf(s.id)
          return (
            <div class="vz-cart-row" key={s.id}>
              <SelectCard
                multi
                thumb={anyImage ? (s.image ?? null) : undefined}
                title={s.name}
                desc={desc || undefined}
                selected={!!entry}
                /*
                 * Wybrana karta jest powierzchnią EDYCJI, nie przełącznikiem -
                 * usuwa wyłącznie kosz. Wcześniej przypadkowe dotknięcie
                 * wyrzucało usługę z wizyty bez ostrzeżenia. Tak samo działa
                 * kreator na stronie.
                 */
                onSelect={() => (entry ? entry.editable && onEdit(s.id) : onToggle(s))}
                /* Podgląd tylko przy niewybranej usłudze i tylko gdy jest co
                   pokazać - po dodaniu do wizyty miejsce zajmują ołówek i kosz,
                   a trzy ikony obok siebie nie mieszczą się na telefonie. */
                action={
                  !entry && (desc || (s.images?.length ?? 0) > 0) ? (
                    <button
                      type="button"
                      class="vz-card-icon"
                      aria-label={`Szczegóły usługi: ${s.name}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        onDetails(s.id)
                      }}
                    >
                      <Info size={16} />
                    </button>
                  ) : undefined
                }
                /* Sterowanie jak w kreatorze na stronie: plus dodaje, a na
                   dodanej pozycji stoją ołówek (wariant i dodatki) oraz kosz. */
                control={
                  entry ? (
                    <span class="vz-card-ctrls">
                      {entry.editable && (
                        <button
                          type="button"
                          class="vz-card-icon"
                          aria-label={`Edytuj ${s.name}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            onEdit(s.id)
                          }}
                        >
                          <Pencil size={16} />
                        </button>
                      )}
                      <button
                        type="button"
                        class="vz-card-icon danger"
                        aria-label={`Usuń ${s.name} z wizyty`}
                        onClick={(e) => {
                          e.stopPropagation()
                          onToggle(s)
                        }}
                      >
                        <Trash size={16} />
                      </button>
                    </span>
                  ) : (
                    <span class="vz-card-add" aria-hidden="true">
                      <Plus size={18} />
                    </span>
                  )
                }
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
              {/* Sam opis pozycji - za edycję odpowiada teraz ołówek na karcie,
                  więc drugi link do tego samego byłby szumem. */}
              {entry?.recap && (
                <div class="vz-cart-recap">
                  <span class="vz-cart-recap-t">{entry.recap}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
