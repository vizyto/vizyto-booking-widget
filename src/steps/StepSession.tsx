import type { GroupClass, GroupSession } from '../api'
import { seatsLeft } from '../api'
import { SelectCard } from '../ui/SelectCard'
import { Clock, Users } from '../ui/icons'

/**
 * Pick a term from the timetable.
 *
 * This is the ONE place where a class genuinely differs from a visit, and the
 * reason the step has its own body instead of reusing the availability grid: a
 * term is a materialized FACT (room booked, instructor assigned, people signed
 * up) with a fixed hour, not a candidate computed from working hours. Rendering
 * it under a day strip with load pills would teach the customer a false model -
 * they are not choosing when to come, they are joining something that already
 * has a time. So: a list grouped by day, with the hour, who leads it and how
 * many seats are left, which is exactly what a club puts on its own wall.
 *
 * A full term stays VISIBLE and unpickable rather than being hidden - "no seats
 * on Wednesday" is information the customer needs in order to pick Thursday.
 * (There is no waitlist for classes: `business_waitlist_entries` has no session
 * column and the service rejects group services outright, so offering "notify
 * me" here would be a promise nothing keeps.)
 */
export function StepSession({
  sessions,
  cls,
  timezone,
  selectedId,
  onPick,
}: {
  sessions: GroupSession[]
  cls: GroupClass | null
  timezone: string | null
  selectedId: number | null
  onPick: (s: GroupSession) => void
}) {
  if (sessions.length === 0) {
    return (
      <div style="margin-top:20px;text-align:center;">
        <div class="vz-muted">Brak zaplanowanych terminów w najbliższym czasie.</div>
        <div class="vz-muted" style="margin-top:4px;">Grafik może się jeszcze zmienić - zajrzyj później.</div>
      </div>
    )
  }

  // Group by the business-local day the server computed. Doing it here from
  // dateLocal (not from the visitor's clock) keeps a 21:00 class on the right day
  // for someone browsing from another timezone.
  const days: { day: string; items: GroupSession[] }[] = []
  for (const s of sessions) {
    const last = days[days.length - 1]
    if (last && last.day === s.dateLocal) last.items.push(s)
    else days.push({ day: s.dateLocal, items: [s] })
  }

  const dayLabel = (d: string) => {
    const label = new Date(`${d}T00:00:00`).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })
    return label.charAt(0).toUpperCase() + label.slice(1)
  }
  const hour = (iso: string) => {
    try {
      return new Intl.DateTimeFormat('pl-PL', {
        hour: '2-digit', minute: '2-digit', timeZone: timezone || 'Europe/Warsaw',
      }).format(new Date(iso))
    } catch {
      return iso.slice(11, 16)
    }
  }

  return (
    <div class="vz-sessions">
      {days.map(({ day, items }) => (
        <div class="vz-slot-group" key={day}>
          <div class="vz-slot-group-h">{dayLabel(day)}</div>
          <div class="vz-list vz-stagger">
            {items.map((s) => {
              const left = seatsLeft(s, cls ?? undefined)
              const full = left === 0
              return (
                <SelectCard
                  key={s.id}
                  title={hour(s.startDate)}
                  sub={s.instructor?.name ? `Prowadzi: ${s.instructor.name}` : undefined}
                  selected={selectedId === s.id}
                  // A full term must not become the selection - the CTA would
                  // then offer a sign-up the server answers with SESSION_FULL.
                  onSelect={() => { if (!full) onPick(s) }}
                  meta={
                    <>
                      <span class="vz-dur"><Clock size={14} /> {hour(s.startDate)} - {hour(s.endDate)}</span>
                      {left == null ? null : full ? (
                        <span class="vz-lock-chip"><Users size={11} /> Brak miejsc</span>
                      ) : (
                        <span class="vz-dur"><Users size={14} /> {seatsCopy(left)}</span>
                      )}
                    </>
                  }
                />
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Polish plural for the remaining-seats chip: 1 miejsce / 2-4 miejsca / 5+ miejsc. */
function seatsCopy(n: number): string {
  if (n === 1) return '1 wolne miejsce'
  const mod100 = n % 100
  const mod10 = n % 10
  const few = mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)
  return `${n} ${few ? 'wolne miejsca' : 'wolnych miejsc'}`
}
