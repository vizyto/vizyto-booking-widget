import type { RentalDaySlots, RentalUnit, Resource } from '../api'
import { formatPrice2, rentalPrice, rentalUnitsLabel } from '../api'
import { dayNum, weekday } from '../dates'
import { Spinner } from '../ui/Spinner'
import { Notice } from '../ui/Notice'
import { SummaryCard } from '../ui/SummaryCard'
import { Calendar, Clock, Users } from '../ui/icons'

/**
 * "Kiedy" for a rental, in the two shapes the billing unit forces:
 *  - minute/hour: pick a START SLOT on a day (a grid, like a visit)
 *  - day/week/month: pick a START and a LENGTH; the window is then re-checked
 *
 * The day strip below is a deliberately simpler twin of the one inside
 * StepDateTime (same CSS classes, so it looks identical) rather than an
 * extraction. StepDateTime carries the live visit flow on a customer's site, and
 * pulling its paging/swipe/month-grid apart to share it is precisely the work the
 * shared booking kit is for - not something to risk inside a feature commit.
 */
export function StepRentalTime({
  head,
  pooled,
  days,
  counts,
  date,
  units,
  unitOptions,
  partySize,
  slots,
  loading,
  rangeOk,
  onPickDate,
  onPickUnits,
  onPickPartySize,
  selectedSlot,
  onPickSlot,
}: {
  head: Resource
  pooled: boolean
  days: string[]
  counts: Record<string, number>
  date: string
  units: number
  unitOptions: number[]
  partySize: number
  slots: RentalDaySlots | null
  loading: boolean
  /** Range mode only: null = not asked yet, false = window taken/closed. */
  rangeOk: boolean | null
  onPickDate: (d: string) => void
  onPickUnits: (u: number) => void
  onPickPartySize: (n: number) => void
  selectedSlot: string
  onPickSlot: (localKey: string) => void
}) {
  const unit: RentalUnit = head.rentalUnit ?? 'hour'
  const isRange = slots?.mode === 'range'
  const maxParty = head.rentalMaxPartySize ?? null
  const total = rentalPrice(head, units)

  const free = (d: string) => (counts[d] ?? 0) > 0
  const returnDate = (() => {
    if (!date) return null
    const ms = { minute: 60_000, hour: 3_600_000, day: 86_400_000, week: 7 * 86_400_000, month: 30 * 86_400_000 }[unit]
    const d = new Date(`${date}T00:00:00`)
    d.setTime(d.getTime() + ms * units)
    return d.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })
  })()

  return (
    <div>
      {pooled && (
        <div class="vz-muted" style="margin-bottom:12px;">
          Przydzielimy wolny egzemplarz na wybrany termin.
        </div>
      )}

      {maxParty != null && (
        <div class="vz-field">
          <label class="vz-label"><Users size={15} /> Ile osób?</label>
          <div class="vz-pills" role="radiogroup" aria-label="Liczba osób">
            {Array.from({ length: maxParty }, (_, i) => i + 1).map((n) => (
              <button
                class={`vz-pill${n === partySize ? ' on' : ''}`}
                onClick={() => onPickPartySize(n)}
                aria-pressed={n === partySize ? 'true' : 'false'}
                type="button"
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Length is picked BEFORE the day: it changes which days and hours are even
          available, so asking after would invalidate the answer just given. */}
      <div class="vz-field">
        <label class="vz-label"><Clock size={15} /> Na jak długo?</label>
        <div class="vz-pills" role="radiogroup" aria-label="Czas wynajmu">
          {unitOptions.map((u) => {
            const p = rentalPrice(head, u)
            return (
              <button
                class={`vz-pill${u === units ? ' on' : ''}`}
                onClick={() => onPickUnits(u)}
                aria-pressed={u === units ? 'true' : 'false'}
                type="button"
              >
                {rentalUnitsLabel(u, unit)}
                {p != null && <small> · {formatPrice2(p)}</small>}
              </button>
            )
          })}
        </div>
      </div>

      <div class="vz-cal-head">
        <span class="vz-cal-month"><Calendar size={16} /> {isRange ? 'Odbiór' : 'Termin'}</span>
      </div>
      <div class="vz-days">
        {days.map((d) => {
          const f = free(d)
          return (
            <button
              class={`vz-day ${d === date ? 'active' : ''}${f ? '' : ' is-disabled'}`}
              aria-disabled={f ? undefined : 'true'}
              aria-current={d === date ? 'true' : undefined}
              onClick={() => { if (f) onPickDate(d) }}
              type="button"
            >
              <small>{weekday(d)}</small>
              {dayNum(d)}
              <span class={`vz-free${f ? '' : ' ghost'}`} />
            </button>
          )
        })}
      </div>

      {loading ? (
        <div class="vz-center"><Spinner /></div>
      ) : isRange ? (
        <div style="margin-top:14px;">
          {rangeOk === false && (
            <Notice title="Termin zajęty">
              Ten okres jest już zajęty albo wypada w dniu zamknięcia. Wybierz inny dzień odbioru.
            </Notice>
          )}
          <SummaryCard
            rows={[
              { label: 'Zwrot', value: returnDate ?? '-' },
              { label: 'Czas', value: rentalUnitsLabel(units, unit) },
              ...(head.rentalDeposit != null ? [{ label: 'Kaucja', value: formatPrice2(head.rentalDeposit) }] : []),
              ...(total != null ? [{ label: 'Kwota', value: formatPrice2(total), total: true }] : []),
            ]}
          />
          {head.rentalDeposit != null && (
            <div class="vz-muted" style="margin-top:8px;">Kaucja rozliczana na miejscu przy odbiorze.</div>
          )}
        </div>
      ) : slots && slots.mode === 'slots' && slots.slots.length === 0 ? (
        <div style="margin-top:20px;text-align:center;">
          <div class="vz-muted">Brak wolnych godzin tego dnia. Wybierz inny dzień.</div>
        </div>
      ) : slots && slots.mode === 'slots' ? (
        <div class="vz-slot-group">
          <div class="vz-slot-group-h">Godzina odbioru</div>
          <div class="vz-slots">
            {slots.slots.map((sl) => (
              <button
                class={`vz-slot${sl.local === selectedSlot ? ' selected' : ''}`}
                onClick={() => onPickSlot(sl.local)}
                aria-pressed={sl.local === selectedSlot ? 'true' : 'false'}
                type="button"
              >
                {sl.local}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
