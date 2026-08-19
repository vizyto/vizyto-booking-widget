import { useState } from 'preact/hooks'
import type { PriceQuote, PromoBadges, RentalDaySlots, RentalUnit, Resource } from '../api'
import { formatPrice2, rentalPrice, rentalUnitsLabel } from '../api'
import { DayStrip, useDayPager } from '../ui/DayStrip'
import { Spinner } from '../ui/Spinner'
import { Notice } from '../ui/Notice'
import { SummaryCard } from '../ui/SummaryCard'
import { Calendar, ChevronLeft, ChevronRight, Clock, Users } from '../ui/icons'
import { PromoBadge, dayPromo } from '../ui/PromoBadge'

/**
 * "Kiedy" for a rental, in the two shapes the billing unit forces:
 *  - minute/hour: pick a START SLOT on a day (a grid, like a visit)
 *  - day/week/month: pick a START and a LENGTH; the window is then re-checked
 *
 * The day strip is the SAME component the visit calendar uses (ui/DayStrip): a
 * rental horizon is 42 days, and a strip that renders them all in one flex row
 * squeezes every tile past the point where the weekday labels stay apart.
 */
const SHORT_STAYS = 6

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
  window: win,
  tz,
  onPickDate,
  onPickUnits,
  onPickPartySize,
  selectedSlot,
  onPickSlot,
  promoBadges,
  quote,
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
  /** The [start, end] the answer so far adds up to - null when the day is closed. */
  window: { startDate: string; endDate: string } | null
  /** Business timezone - pickup and return are stated in it, not the visitor's. */
  tz: string | null
  onPickDate: (d: string) => void
  onPickUnits: (u: number) => void
  onPickPartySize: (n: number) => void
  selectedSlot: string
  onPickSlot: (localKey: string) => void
  /**
   * A badge is an announced reduction: it shows only with the answer's `lowest`
   * (this length's price and its 30-day price), which the booking summary carries.
   */
  promoBadges?: PromoBadges | null
  quote?: PriceQuote | null
}) {
  const unit: RentalUnit = head.rentalUnit ?? 'hour'
  const isRange = slots?.mode === 'range'
  const maxParty = head.rentalMaxPartySize ?? null
  const total = rentalPrice(head, units)
  const selectedSlotPromo = slots?.mode === 'slots'
    ? slots.slots.find((slot) => slot.local === selectedSlot)?.promo ?? null
    : null
  // The chosen hour's promotion is priced for the minimum length: that pill shows the
  // price paid, plain - its reduction and note live in the summary (#430).
  const lengthPromo = selectedSlotPromo?.advertised ? selectedSlotPromo : null
  const minUnits = Math.max(1, head.rentalMinUnits ?? 1)

  const free = (d: string) => (counts[d] ?? 0) > 0
  const badges = promoBadges?.lowest ? promoBadges : null
  const dayMarks = dayPromo(days, free, badges?.days)
  const slotBadge = (sl: { start: string; promo?: { advertised: boolean; badge: string | null } | null }): string | null =>
    (sl.promo?.advertised && sl.promo.badge ? sl.promo.badge : badges?.slots[sl.start.slice(11, 16)] ?? null)
  // Every promoted day and hour carries its corner badge (owner's mockup, #430).
  const slotBadges = slots?.mode === 'slots' && badges ? slots.slots.map(slotBadge) : []
  const slotMarked = slotBadges.some(Boolean)
  const pager = useDayPager(days, date)
  // A rental can run for a dozen units, and a dozen chips is a wall that pushes
  // the calendar off the panel. Show the short stays everyone picks and let the
  // rest in on demand - already expanded when the answer itself is a long one.
  const [allUnits, setAllUnits] = useState(false)
  const showAll = allUnits || units > unitOptions[Math.min(SHORT_STAYS, unitOptions.length) - 1]!
  const shownOptions = showAll ? unitOptions : unitOptions.slice(0, SHORT_STAYS)
  const hiddenCount = unitOptions.length - shownOptions.length
  // Pickup and return are shown as the exact instants the reservation will carry,
  // in the BUSINESS timezone - a van picked up at 07:00 must not read "00:00"
  // because the visitor happens to sit in another zone.
  const stamp = (iso: string) =>
    new Date(iso).toLocaleString('pl-PL', {
      weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
      timeZone: tz || undefined,
    })

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
          {shownOptions.map((u) => {
            const p = rentalPrice(head, u)
            return (
              <button
                class={`vz-pill${u === units ? ' on' : ''}`}
                onClick={() => onPickUnits(u)}
                aria-pressed={u === units ? 'true' : 'false'}
                type="button"
              >
                {rentalUnitsLabel(u, unit)}
                {lengthPromo && u === minUnits ? (
                  <small> · {formatPrice2(lengthPromo.price)}</small>
                ) : p != null && <small> · {formatPrice2(p)}</small>}
              </button>
            )
          })}
          {hiddenCount > 0 && (
            <button class="vz-pill vz-pill-more" onClick={() => setAllUnits(true)} type="button">
              Dłużej<small> · do {rentalUnitsLabel(unitOptions[unitOptions.length - 1]!, unit)}</small>
            </button>
          )}
        </div>
      </div>

      <div class="vz-cal-head">
        <span class="vz-cal-month"><Calendar size={16} /> {isRange ? 'Dzień odbioru' : 'Termin'}</span>
      </div>
      {/* The same period bar as the visit calendar: arrows page the strip, the
          label names the days on screen. */}
      <div class="vz-period">
        <button class="vz-period-nav" onClick={pager.goPrev} disabled={pager.prevDisabled} aria-label="Poprzednie dni" type="button"><ChevronLeft size={18} /></button>
        <div class="vz-period-label is-static"><span>{pager.label}</span></div>
        <button class="vz-period-nav" onClick={pager.goNext} disabled={pager.nextDisabled} aria-label="Następne dni" type="button"><ChevronRight size={18} /></button>
      </div>
      <DayStrip pager={pager} counts={counts} date={date} onPickDate={onPickDate} mark={dayMarks.tile} />
      {/* The 30-day note of the marks sits in the booking summary, next to the price (#430). */}

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
              ...(win ? [{ label: 'Odbiór', value: stamp(win.startDate) }, { label: 'Zwrot', value: stamp(win.endDate) }] : []),
              { label: 'Czas', value: rentalUnitsLabel(units, unit) },
              ...(head.rentalDeposit != null ? [{ label: 'Kaucja', value: formatPrice2(head.rentalDeposit) }] : []),
              // An advertised quote brings its own price block; otherwise the
              // server's total (when there is one) fills the ordinary row.
              ...(!quote?.advertised && (quote?.total ?? total) != null
                ? [{ label: 'Kwota', value: formatPrice2((quote?.total ?? total)!), total: true }]
                : []),
            ]}
            quote={quote}
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
          <div class={`vz-slots${slotMarked ? ' has-promo' : ''}`}>
            {slots.slots.map((sl, index) => {
              const badge = slotBadges[index] ?? null
              return (
                <button
                  class={`vz-slot${sl.local === selectedSlot ? ' selected' : ''}`}
                  aria-label={badge ? `${sl.local}, promocja ${badge}` : undefined}
                  onClick={() => onPickSlot(sl.local)}
                  aria-pressed={sl.local === selectedSlot ? 'true' : 'false'}
                  type="button"
                >
                  {sl.local}
                  {badge && <PromoBadge corner>{badge}</PromoBadge>}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
