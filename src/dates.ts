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
