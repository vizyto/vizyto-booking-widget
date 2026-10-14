// Date helpers shared across booking steps. Days are plain YYYY-MM-DD strings in
// the visitor's local calendar; slot times stay UTC keys handled in api.ts.

export const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function nextDays(n: number): string[] {
  const out: string[] = []
  const b = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(b)
    d.setDate(b.getDate() + i)
    out.push(ymd(d))
  }
  return out
}

const at = (d: string) => new Date(d + 'T00:00:00')

export const weekday = (d: string) => at(d).toLocaleDateString('pl-PL', { weekday: 'short' })
export const dayNum = (d: string) => at(d).getDate()
export const dayMonth = (d: string) => at(d).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })
export const fullDate = (d: string) =>
  at(d).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const monthYear = (d: string) => capitalize(at(d).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' }))
// Fixed list instead of Intl: engines disagree on dots in short Polish months.
const MONTHS_SHORT = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru']
const monthShort = (d: string) => MONTHS_SHORT[at(d).getMonth()]

// "Czerwiec 2026" when one month; a span that crosses months is abbreviated so it
// fits the period bar on one line: "Wrz / paź 2026", "Gru 2026 / sty 2027".
export function spanLabel(first: string, last: string): string {
  const a = at(first)
  const b = at(last)
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) return monthYear(first)
  if (a.getFullYear() === b.getFullYear()) return `${capitalize(monthShort(first))} / ${monthShort(last)} ${b.getFullYear()}`
  return `${capitalize(monthShort(first))} ${a.getFullYear()} / ${monthShort(last)} ${b.getFullYear()}`
}

export const DOW = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Ndz']

// Monday-first weeks for a given year/month (0-based). Cells outside the month
// are '' so the grid keeps its shape.
export function monthMatrix(year: number, month: number): string[][] {
  const first = new Date(year, month, 1)
  const lead = (first.getDay() + 6) % 7 // Mon=0
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: string[] = Array.from({ length: lead }, () => '')
  for (let d = 1; d <= daysInMonth; d++) cells.push(ymd(new Date(year, month, d)))
  while (cells.length % 7 !== 0) cells.push('')
  const weeks: string[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

export const monthOf = (d: string) => ({ year: at(d).getFullYear(), month: at(d).getMonth() })
export const monthTitle = (year: number, month: number) =>
  monthYear(ymd(new Date(year, month, 1)))

/**
 * The UTC offset of `tz` at a given instant, in milliseconds. Read back what the
 * instant looks like on the zone's wall clock and subtract - the only way to get
 * a zone offset from the platform without shipping a timezone library.
 */
function tzOffset(ms: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ms))
  const p: Record<string, string> = {}
  for (const { type, value } of parts) p[type] = value
  const wall = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour! % 24, +p.minute!, +p.second!)
  return wall - ms
}

/**
 * The instant at which the wall clock in `tz` reads `date` `hhmm`, as an ISO
 * string. Guess with the offset at the naive instant, then correct once with the
 * offset at the guess - enough for every real zone, including the DST edges
 * (inside the repeated hour either answer is defensible, and a rental pickup at
 * 02:30 on the fold night is not a case worth a library).
 */
export function zonedIso(date: string, hhmm: string, tz: string): string | null {
  const naive = Date.parse(`${date}T${hhmm}:00Z`)
  if (Number.isNaN(naive)) return null
  const guess = naive - tzOffset(naive, tz)
  return new Date(naive - tzOffset(guess, tz)).toISOString()
}

/** Calendar day (YYYY-MM-DD) an instant falls on, on the wall clock of `tz`. */
export function zonedDay(ms: number, tz: string): string {
  return new Date(ms + tzOffset(ms, tz)).toISOString().slice(0, 10)
}

/**
 * The instant of a picked rental hour (slot mode: minute/hour units).
 *
 * A tile of the day grid carries the business's WALL-CLOCK time (`local`,
 * "10:00", which the API formats in the business timezone) next to the real
 * instant (`start`). The instant the server published wins whenever that tile
 * belongs to `date`; without one the wall time is converted in the business
 * timezone. Gluing `local` to "Z" instead (what the widget did from v1.9.0 to
 * v1.14.0) quoted, showed and created every hourly rental 1 hour late in winter
 * and 2 hours late in summer in Poland.
 */
export function rentalSlotStartIso(
  date: string,
  slotLocal: string,
  tz: string,
  slots?: ReadonlyArray<{ start: string; local: string }> | null,
): string | null {
  if (!date || !slotLocal) return null
  const hhmm = slotLocal.slice(0, 5)
  try {
    const hit = slots?.find((s) => s.local.slice(0, 5) === hhmm)
    const ms = hit ? Date.parse(hit.start) : NaN
    // A tile from another day (a grid that has not caught up with the date yet)
    // must not lend its instant to this one.
    if (!Number.isNaN(ms) && zonedDay(ms, tz) === date) return new Date(ms).toISOString()
    return zonedIso(date, hhmm, tz)
  } catch {
    // An unknown zone name: nothing sane to convert with.
    return null
  }
}
