import type { Resource, Service } from '../api'
import { configuredTotals, formatDuration, formatPrice2, workerOffersService } from '../api'
import { SelectCard } from '../ui/SelectCard'
import { Notice } from '../ui/Notice'
import { Clock } from '../ui/icons'

type ResChoice = number | 'any'

// Provider pick step. 'staff' lists the workers who perform EVERY position in
// the cart (with their own price/duration summed across it); 'unit' lists the
// objects in the cart's primary pool (loża, tor, stanowisko). Both offer a
// "Dowolny" option that lets the server assign - for a chain that also means it
// may split the visit between people, which is the only way when nobody covers
// the whole cart alone.
export function StepResource({
  providers,
  items,
  mode,
  anyLabel,
  selected,
  onPick,
  performers,
}: {
  providers: Resource[]
  /** The whole cart, in chain order - WITH each position's variant and add-ons. */
  items: { service: Service; variantDuration: number | null; addonIds: number[] }[]
  mode: 'staff' | 'unit'
  // Label of the "Dowolny ..." option (specialist vs pool type).
  anyLabel: string
  selected: ResChoice | null
  onPick: (r: ResChoice) => void
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

  // "od X" for the "Dowolny" row: the cheapest performer of each position (they
  // need not be the same person - the engine may split the chain).
  const anyFrom = items.reduce((sum, it) => {
    const prices = providers
      .filter((p) => workerOffersService(it.service, p.id))
      .map((p) => configuredTotals(it.service, it.variantDuration, it.addonIds, p.id).price)
    return sum + (prices.length ? Math.min(...prices) : configuredTotals(it.service, it.variantDuration, it.addonIds).price)
  }, 0)
  const anyVaries = providers.some((p) => totalsFor(p.id).price !== anyFrom)

  return (
    <div class="vz-fade-in">
      {performers && performers.length > 0 && (
        <Notice title="Wizytę wykona kilka osób">
          Żaden specjalista nie wykonuje samodzielnie wszystkich wybranych usług.
          Wybierz opcję Dowolny, a dobierzemy obsadę:
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
        {(providers.length > 1 || (performers?.length ?? 0) > 0) && (
          <SelectCard
            avatar="✦"
            title={anyLabel}
            sub={items.length > 1 ? 'dobierzemy obsadę do wszystkich usług' : 'najszybszy wolny termin'}
            selected={selected === 'any'}
            onSelect={() => onPick('any')}
            meta={mode === 'staff' ? <span class="vz-price">{anyVaries ? 'od ' : ''}{formatPrice2(anyFrom)}</span> : undefined}
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
              selected={selected === p.id}
              onSelect={() => onPick(p.id)}
            />
          )
        })}
      </div>
    </div>
  )
}
