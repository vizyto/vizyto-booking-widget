import type { TableDay } from '../tables'
import { anyGrey, tableDayEmpty, tableDayOver, visiblePeriods } from '../tables'
import { dayNum, weekday } from '../dates'
import { Spinner } from '../ui/Spinner'
import { Bell, Calendar } from '../ui/icons'

/**
 * "Kiedy" for a table (#903 F11), the WEB TableDateStep in widget form: a day strip
 * with dots from the table counts, then the day's hours grouped by service period
 * with each period's last seating. A start without a table for the party stays on
 * screen, grey; past starts are left out.
 *
 * Unlike the rental strip, a day without free starts stays tappable: that is where
 * the empty-day state and "Powiadom mnie" live.
 */
export function StepTableTime({
  days,
  counts,
  date,
  onPickDate,
  day,
  loading,
  error,
  onRetry,
  selectedStartAt,
  onPickSlot,
  canWaitlist,
  onWaitlist,
  waitlistBusy,
}: {
  days: string[]
  counts: Record<string, number>
  date: string
  onPickDate: (d: string) => void
  day: TableDay | null
  loading: boolean
  /** The day could not be read: say so and offer a retry instead of an empty grid. */
  error: boolean
  onRetry: () => void
  selectedStartAt: string | null
  onPickSlot: (startAt: string) => void
  canWaitlist: boolean
  onWaitlist: () => void
  waitlistBusy?: boolean
}) {
  const periods = visiblePeriods(day)
  const closed = !!day && day.periods.length === 0
  const over = !!day && tableDayOver(day.periods)
  const empty = tableDayEmpty(day)

  return (
    <div class="vz-fade-in">
      <div class="vz-cal-head">
        <span class="vz-cal-month"><Calendar size={16} /> Termin</span>
      </div>
      <div class="vz-days scroll">
        {days.map((d) => {
          const free = (counts[d] ?? 0) > 0
          return (
            <button
              class={`vz-day ${d === date ? 'active' : ''}`}
              aria-current={d === date ? 'true' : undefined}
              onClick={() => onPickDate(d)}
              type="button"
            >
              <small>{weekday(d)}</small>
              {dayNum(d)}
              <span class={`vz-free${free ? '' : ' ghost'}`} />
            </button>
          )
        })}
      </div>

      {loading ? (
        <div class="vz-center"><Spinner /> Szukam wolnych stolików…</div>
      ) : !date ? null : error ? (
        <div style="margin-top:20px;text-align:center;">
          <div class="vz-muted">Nie udało się sprawdzić wolnych stolików.</div>
          <button class="vz-btn ghost mt" onClick={onRetry} type="button">Spróbuj ponownie</button>
        </div>
      ) : day && !empty ? (
        <>
          {periods.map((p) => (
            <div class="vz-slot-group" aria-label={p.name}>
              <div class="vz-slot-group-h">
                <span class="vz-slot-group-name">{p.name}</span>
                <span class="vz-slot-group-aside">ostatnie wejście {p.lastSeating}</span>
              </div>
              <div class="vz-slots vz-stagger">
                {p.slots.map((s) => {
                  const selected = s.startAt === selectedStartAt
                  return (
                    <button
                      class={`vz-slot${selected ? ' selected' : ''}`}
                      disabled={!s.available}
                      aria-disabled={s.available ? undefined : 'true'}
                      aria-pressed={selected ? 'true' : 'false'}
                      onClick={() => { if (s.available) onPickSlot(s.startAt) }}
                      type="button"
                    >
                      {s.time}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          {anyGrey(periods) && (
            <div class="vz-muted" style="margin-top:12px;">Szare godziny: brak stolika dla tej liczby osób</div>
          )}
        </>
      ) : day ? (
        <div style="margin-top:20px;text-align:center;">
          <div class="vz-muted">
            {closed ? 'Tego dnia lokal nie przyjmuje rezerwacji'
              : over ? 'Na ten dzień nie można już zarezerwować stolika'
                : 'Tego dnia nie ma wolnego stolika'}
          </div>
          {!closed && !over && canWaitlist && (
            <button class="vz-btn ghost mt" onClick={onWaitlist} disabled={waitlistBusy} type="button">
              {waitlistBusy ? <><Spinner /> Zapisuję…</> : <><Bell size={17} /> Powiadom mnie</>}
            </button>
          )}
        </div>
      ) : null}
    </div>
  )
}
