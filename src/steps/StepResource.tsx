import type { Resource, Service } from '../api'
import { configuredTotals, formatDuration, formatPrice2, workerOffersService } from '../api'
import { SelectCard } from '../ui/SelectCard'
import { Notice } from '../ui/Notice'
import { Clock, Shuffle, Users } from '../ui/icons'
import { ItemProviders } from './ItemProviders'

type ResChoice = number | 'any'

type Item = { service: Service; variantDuration: number | null; addonIds: number[]; resourceId?: number | null }

// Provider pick step, in the three modes the whole product shares:
//   "Bez preferencji"     - the server assigns per position (maximum availability)
//   "…dla każdej usługi"  - one answer per cart position, mixing is legal
//   a person               - ONE specialist takes the WHOLE cart (only those who can)
// 'unit' keeps its own shape: the objects in the cart's primary pool (loża, tor,
// stanowisko) plus "Dowolny", with no per-position question to ask.
export function StepResource({
  providers,
  items,
  workers,
  mode,
  anyLabel,
  selected,
  perItem,
  canPerItem,
  onPick,
  onPickPerItem,
  onPickItemResource,
  performers,
}: {
  providers: Resource[]
  /** The whole cart, in chain order - WITH each position's variant and add-ons. */
  items: Item[]
  /** Every bookable worker (per-position candidates are filtered from these). */
  workers: Resource[]
  mode: 'staff' | 'unit'
  // Label of the "Dowolny ..." option (specialist vs pool type).
  anyLabel: string
  /** The cart-wide answer: 'any', a provider id, or null when there is none. */
  selected: ResChoice | null
  /** Per-position mode is on - it cannot be derived, an all-null cart looks like "any". */
  perItem: boolean
  /** Whether per-position mode is worth offering at all. */
  canPerItem: boolean
  onPick: (r: ResChoice) => void
  onPickPerItem: () => void
  onPickItemResource: (serviceId: number, resourceId: number | null) => void
  /** Set only when nobody performs the whole cart: who can take each position. */
  performers?: { serviceName: string; names: string[] }[]
}) {
  // What this person would charge for the WHOLE cart, and how long they'd take.
  // configuredTotals (not effectiveForWorker) - otherwise the chosen variant and
  // the add-ons drop out and this step contradicts the cart bar right below it.
  const totalsFor = (workerId: number) =>
    items.reduce(
      (acc, it) => {
        const t = configuredTotals(it.service, it.variantDuration, it.addonIds, workerId)
        return { price: acc.price + t.price, duration: acc.duration + t.duration }
      },
      { price: 0, duration: 0 },
    )

  // "od X" for the "Bez preferencji" row: the cheapest performer of each position
  // (they need not be the same person - the engine may split the chain).
  const anyFrom = items.reduce((sum, it) => {
    const prices = providers
      .filter((p) => workerOffersService(it.service, p.id))
      .map((p) => configuredTotals(it.service, it.variantDuration, it.addonIds, p.id).price)
    return sum + (prices.length ? Math.min(...prices) : configuredTotals(it.service, it.variantDuration, it.addonIds).price)
  }, 0)
  const anyVaries = providers.some((p) => totalsFor(p.id).price !== anyFrom)
  const showAny = providers.length > 1 || canPerItem || (performers?.length ?? 0) > 0

  return (
    <div class="vz-fade-in">
      {performers && performers.length > 0 && (
        <Notice title="Wizytę wykona kilka osób">
          {canPerItem
            ? 'Żaden specjalista nie wykonuje samodzielnie wszystkich wybranych usług. Zostaw wybór nam albo wskaż osobę do każdej usługi osobno:'
            : 'Żaden specjalista nie wykonuje samodzielnie wszystkich wybranych usług. Wybierz opcję Bez preferencji, a dobierzemy obsadę:'}
          <ul class="vz-perf">
            {performers.map((p) => (
              <li>
                <b>{p.serviceName}</b>
                {/* Zbiór, nie obietnica: konkretną osobę serwer rozstrzyga przy
                    tworzeniu wizyty, więc "wykona" byłoby kłamstwem. */}
                {p.names.length ? ` - wykonują: ${p.names.join(', ')}` : ''}
              </li>
            ))}
          </ul>
        </Notice>
      )}

      <div class="vz-list vz-stagger" role="radiogroup" aria-label={mode === 'unit' ? 'Wybór zasobu' : 'Wybór specjalisty'}>
        {showAny && (
          <SelectCard
            avatar={<Shuffle size={20} />}
            title={anyLabel}
            sub={mode === 'unit' ? 'przydzielimy pierwszy wolny' : 'Maksymalna dostępność'}
            selected={!perItem && selected === 'any'}
            onSelect={() => onPick('any')}
            meta={mode === 'staff' ? <span class="vz-price">{anyVaries ? 'od ' : ''}{formatPrice2(anyFrom)}</span> : undefined}
          />
        )}

        {canPerItem && (
          <>
            <SelectCard
              avatar={<Users size={20} />}
              title="Wybierz specjalistę do każdej usługi"
              sub="Każdą usługę może wykonać kto inny"
              selected={perItem}
              onSelect={onPickPerItem}
            />
            {perItem && <ItemProviders items={items} workers={workers} onPick={onPickItemResource} />}
          </>
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
          const totals = totalsFor(p.id)
          return (
            <SelectCard
              avatar={p.image ? <img src={p.image} alt="" /> : p.name.charAt(0)}
              title={p.name}
              sub={p.position || undefined}
              meta={
                <>
                  <span class="vz-dur"><Clock size={14} /> {formatDuration(totals.duration)}</span>
                  <span class="vz-price">{formatPrice2(totals.price)}</span>
                </>
              }
              selected={!perItem && selected === p.id}
              onSelect={() => onPick(p.id)}
            />
          )
        })}
      </div>
    </div>
  )
}
