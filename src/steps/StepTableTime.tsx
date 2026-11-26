import type { TableDay } from '../tables'
import { anyGrey, tableDayEmpty, tableDayOver, visiblePeriods } from '../tables'
import { DayHeading, MonthCalendar } from '../ui/MonthCalendar'
import { Spinner } from '../ui/Spinner'
import { Bell } from '../ui/icons'

/**
 * "Kiedy" for a table (#903 F11), the WEB TableDateStep in widget form: the month
 * calendar with bars from the table counts, then the day's hours grouped by service
 * period with each period's last seating. A start without a table for the party
 * stays on screen, greyed and struck through; past starts are left out.
 *
 * Unlike the rental calendar, a day without free starts stays tappable: that is
 * where the empty-day state and "Powiadom mnie" live.
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
      <MonthCalendar days={days} counts={counts} date={date} onPickDate={onPickDate} emptyTappable />

      {loading ? (
        <div class="vz-center"><Spinner /> Szukam wolnych stolików…</div>
      ) : !date ? null : error ? (
        <div style="margin-top:20px;text-align:center;">
          <div class="vz-muted">Nie udało się sprawdzić wolnych stolików.</div>
          <button class="vz-btn ghost mt" onClick={onRetry} type="button">Spróbuj ponownie</button>
        </div>
      ) : day && !empty ? (
        <>
          <DayHeading date={date} count={periods.reduce((n, p) => n + p.slots.filter((s) => s.available).length, 0)} />
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
