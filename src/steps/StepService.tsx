import { useMemo, useState } from 'preact/hooks'
import type { PublicPromotionSummary, Resource, Service, ServiceCategory } from '../api'
import { formatDuration, priceLabel, richTextToPlain, serviceBaseRange } from '../api'
import { CdnImg } from '../ui/CdnImg'
import { LowestPriceLine, PromoBadge } from '../ui/PromoBadge'
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
  category,
  onCategory,
  promotionSummary,
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
  /**
   * The picked category, owned by the flow: this step is unmounted while the details
   * sheet or the variant panel is open and must come back on the same chip.
   * null = nothing picked yet, the business's first category.
   */
  category: number | 'all' | null
  onCategory: (c: number | 'all' | null) => void
  promotionSummary?: PublicPromotionSummary | null
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

  // The row opens on the business's FIRST category: the order of categories is the
  // business's call (owner, 2026-11-26), "Wszystkie" closes the row. While a search
  // runs no chip is pressed and the list is the search result across the whole offer.
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const active: number | 'all' | null = q ? null : category ?? cats[0]?.id ?? 'all'

  const inCategory = active === 'all' || active == null ? services : cats.find((c) => c.id === active)?.items ?? services
  const shown = q ? services.filter((s) => s.name.toLowerCase().includes(q)) : inCategory

  // When any shown service has a photo, render a thumbnail square on every row
  // (photo or a letter placeholder) so the list stays aligned; otherwise keep
  // the clean text-only layout.
  const anyImage = useMemo(() => shown.some((s) => !!s.image), [shown])
  const entryOf = (id: number) => cart.find((c) => c.serviceId === id)
  const pickCategory = (id: number | 'all') => { setQuery(''); onCategory(id) }

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

      {cats.length > 0 && (
        <div class="vz-cats" role="group" aria-label="Kategorie usług">
          {cats.map((c) => (
            <button class={`vz-cat${active === c.id ? ' on' : ''}`} aria-pressed={active === c.id ? 'true' : 'false'} onClick={() => pickCategory(c.id)} type="button">
              {c.name}
            </button>
          ))}
          <button class={`vz-cat${active === 'all' ? ' on' : ''}`} aria-pressed={active === 'all' ? 'true' : 'false'} onClick={() => pickCategory('all')} type="button">
            Wszystkie
          </button>
        </div>
      )}

      {shown.length === 0 && (
        <p class="vz-muted" style="padding:12px 2px;">
          {q ? 'Brak usług pasujących do wyszukiwania.' : 'Ten salon nie ma jeszcze usług dostępnych online.'}
        </p>
      )}

      {/* Jedna wizyta może łączyć kilka usług, więc to lista dodawania, nie wybór
          jednej opcji. Wiersz jak w aplikacji (BookingServiceRow, #1168): bez ramki,
          nazwa nad czasem, cena po prawej, potem okrągłe przyciski. Treść wiersza
          otwiera szczegóły usługi, plus dodaje ją do wizyty, a na dodanej pozycji
          stoją ołówek (wariant i dodatki) oraz kosz. Tylko dodana pozycja nosi obrys. */}
      <div class="vz-svc-list vz-stagger" role="group" aria-label="Usługi">
        {shown.map((s) => {
          const { min, from } = serviceBaseRange(s, workers)
          const desc = richTextToPlain(s.description)
          const entry = entryOf(s.id)
          const promotion = promotionSummary?.services.find((p) => p.businessServiceId === s.id)
          // Przypięty wariant niesie własną cenę i czas w plakietce pod wierszem -
          // bazowe "od 50 zł / 45 min" mówiłoby wtedy co innego niż sama pozycja.
          // Bez ceny nie ogłaszamy też obniżki: plakietka i nota idą razem z nią.
          const showMeta = !entry?.hideMeta
          const locked = s.viewerAccess === 'locked'
          return (
            <div class={`vz-svc${entry ? ' selected' : ''}`} key={s.id}>
              <div class="vz-svc-row">
                {/* Treść wiersza to podgląd, nie przełącznik: pokazuje galerię i pełny
                    opis, z których dopiero się rezerwuje. Wybór usługi należy wyłącznie
                    do plusa, a usunięcie do kosza - przypadkowe dotknięcie niczego nie
                    dodaje ani nie wyrzuca. Sterowanie jest RODZEŃSTWEM treści, nigdy jej
                    dzieckiem (żaden element interaktywny nie siedzi w innym). */}
                <div
                  class="vz-svc-hit"
                  role="button"
                  tabIndex={0}
                  onClick={() => onDetails(s.id)}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onDetails(s.id) }
                  }}
                >
                  {anyImage && <ServiceThumb image={s.image ?? null} name={s.name} />}
                  <span class="vz-svc-main">
                    <span class="vz-svc-name">{s.name}</span>
                    {/* The row's name is its content (duration, price, promotion); this only
                        says what a tap does, to a screen reader. */}
                    <span class="vz-sr">. Zobacz szczegóły.</span>
                    {desc && <span class="vz-svc-desc">{desc}</span>}
                    {showMeta && <span class="vz-svc-meta">{formatDuration(s.duration)}</span>}
                    {((showMeta && promotion) || locked) && (
                      <span class="vz-svc-notes">
                        {showMeta && promotion && <PromoBadge>Zaoszczędź do {promotion.saveUpToPercent}%</PromoBadge>}
                        {showMeta && promotion && <LowestPriceLine price={promotion.priorPrice} isFrom={promotion.priorPriceIsFrom} />}
                        {/* Whitelist-locked: still selectable - logging in may unlock it. */}
                        {locked && <span class="vz-lock-chip"><Lock size={11} /> Dla stałych klientów</span>}
                      </span>
                    )}
                  </span>
                  {showMeta && <span class="vz-svc-price">{priceLabel(min, from)}</span>}
                </div>
                <span class="vz-svc-ctrls">
                  {entry ? (
                    <>
                      {entry.editable && (
                        <button type="button" class="vz-rowbtn edit" aria-label={`Edytuj ${s.name}`} onClick={() => onEdit(s.id)}>
                          <Pencil size={16} />
                        </button>
                      )}
                      <button type="button" class="vz-rowbtn remove" aria-label={`Usuń ${s.name} z wizyty`} onClick={() => onToggle(s)}>
                        <Trash size={16} />
                      </button>
                    </>
                  ) : (
                    <button type="button" class="vz-rowbtn add" aria-label={`Dodaj ${s.name} do wizyty`} onClick={() => onToggle(s)}>
                      <Plus size={18} />
                    </button>
                  )}
                </span>
              </div>
              {/* Konfiguracja pozycji jako plakietki w obrysie wybranego wiersza -
                  wariant, potem dodatki. Edytuje ołówek, więc plakietki są opisem, nie
                  przyciskiem; wyjątkiem jest zaproszenie do dodatków i niedomknięta
                  wymagana grupa. */}
              {entry && (entry.chips.length > 0 || entry.editable) && (
                <div class="vz-svc-foot">
                  {entry.chips.map((c) => (
                    <span class="vz-tag" key={c.label}>
                      {c.clock && <Clock size={12} />}
                      {c.label}
                      {c.extra && <span class="vz-tag-x">{c.extra}</span>}
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
                    <button type="button" class="vz-tag err" onClick={() => onEdit(s.id)}>
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

/** Kwadratowa miniatura usługi; zepsute albo brakujące zdjęcie = litera zastępcza. */
function ServiceThumb({ image, name }: { image: string | null; name: string }) {
  const [ok, setOk] = useState(true)
  return (
    <span class="vz-svc-thumb">
      {image && ok ? <CdnImg src={image} width={160} alt="" loading="lazy" onError={() => setOk(false)} /> : name.charAt(0)}
    </span>
  )
}
