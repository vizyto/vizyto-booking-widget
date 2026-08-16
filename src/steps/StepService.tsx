import { useMemo, useState } from 'preact/hooks'
import type { Resource, Service, ServiceCategory } from '../api'
import { formatDuration, priceLabel, richTextToPlain, serviceBaseRange } from '../api'
import { SelectCard } from '../ui/SelectCard'
import { Clock, Lock, Pencil, Plus, Search, Trash } from '../ui/icons'

/** Jedna plakietka konfiguracji pozycji: wariant albo dodatek. */
export type CartChip = { label: string; extra?: string; clock?: boolean }

/** One position already in the cart, as the list needs to render it. */
export type CartEntry = {
  serviceId: number
  /** Wariant + wybrane dodatki jako plakietki (footer karty w kreatorze na stronie). */
  chips: CartChip[]
  /** Pozycja ma co konfigurować - ołówek i zaproszenie do dodatków. */
  editable: boolean
  /** Wariant przypięty: bazowe "od X zł / 45 min" na karcie przeczyłoby wyborowi. */
  hideMeta: boolean
  /** Wymagana grupa dodatków jeszcze niedomknięta - blokuje "Dalej". */
  issue: boolean
}

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
  /** Otwiera szczegóły usługi (galeria + pełny opis) - klik w treść kafla. */
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
          jednej opcji. Podział ról jak w kreatorze na stronie: treść kafla
          otwiera szczegóły usługi, plus dodaje ją do wizyty, a na dodanej
          pozycji stoją ołówek (wariant i dodatki) oraz kosz. */}
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
                /* Treść kafla to podgląd, nie przełącznik: pokazuje galerię i
                   pełny opis, z których dopiero się rezerwuje. Wybór usługi
                   należy wyłącznie do plusa, a usunięcie do kosza - dzięki temu
                   przypadkowe dotknięcie niczego nie dodaje ani nie wyrzuca. */
                onSelect={() => onDetails(s.id)}
                control={
                  entry ? (
                    <span class="vz-card-ctrls">
                      {entry.editable && (
                        <button
                          type="button"
                          class="vz-card-icon"
                          aria-label={`Edytuj ${s.name}`}
                          onClick={() => onEdit(s.id)}
                        >
                          <Pencil size={17} />
                        </button>
                      )}
                      <button
                        type="button"
                        class="vz-card-icon danger"
                        aria-label={`Usuń ${s.name} z wizyty`}
                        onClick={() => onToggle(s)}
                      >
                        <Trash size={17} />
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      class="vz-card-add"
                      aria-label={`Dodaj ${s.name} do wizyty`}
                      onClick={() => onToggle(s)}
                    >
                      <Plus size={20} />
                    </button>
                  )
                }
                /* Przypięty wariant niesie własną cenę i czas w plakietce pod
                   kartą - bazowe "od 50 zł / 45 min" mówiłoby wtedy co innego
                   niż sama pozycja (tak samo hideMeta w kreatorze na stronie). */
                meta={
                  entry?.hideMeta ? (
                    s.viewerAccess === 'locked' ? <span class="vz-lock-chip"><Lock size={11} /> Dla stałych klientów</span> : undefined
                  ) : (
                    <>
                      <span class="vz-dur"><Clock size={14} /> {formatDuration(s.duration)}</span>
                      <span class="vz-price">{priceLabel(min, from)}</span>
                      {/* Whitelist-locked: still selectable - logging in may unlock it. */}
                      {s.viewerAccess === 'locked' && (
                        <span class="vz-lock-chip"><Lock size={11} /> Dla stałych klientów</span>
                      )}
                    </>
                  )
                }
              />
              {/* Konfiguracja pozycji jako plakietki - wariant, potem dodatki,
                  jak stopka wybranej karty w kreatorze na stronie. Edytuje
                  ołówek, więc plakietki są opisem, nie przyciskiem; wyjątkiem
                  jest zaproszenie do dodatków i niedomknięta wymagana grupa. */}
              {entry && (entry.chips.length > 0 || entry.editable) && (
                <div class="vz-cart-recap">
                  {entry.chips.map((c) => (
                    <span class="vz-chip" key={c.label}>
                      {c.clock && <Clock size={12} />}
                      {c.label}
                      {c.extra && <span class="vz-chip-x">{c.extra}</span>}
                    </span>
                  ))}
                  {entry.chips.length === 0 && (
                    <button
                      type="button"
                      class={`vz-chip-add${entry.issue ? ' err' : ''}`}
                      onClick={() => onEdit(s.id)}
                    >
                      <span class="vz-chip-plus"><Plus size={13} /></span>
                      {entry.issue ? 'Wybierz wymagane dodatki' : 'Dodaj dodatki'}
                    </button>
                  )}
                  {entry.chips.length > 0 && entry.issue && (
                    <button type="button" class="vz-chip err" onClick={() => onEdit(s.id)}>
                      Wybierz wymagane dodatki
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
