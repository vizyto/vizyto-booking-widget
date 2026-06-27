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
const monthOnly = (d: string) => capitalize(at(d).toLocaleDateString('pl-PL', { month: 'long' }))

// "Czerwiec 2026" when one month, "Czerwiec / Lipiec 2026" when the span crosses.
export function spanLabel(first: string, last: string): string {
  const a = at(first)
  const b = at(last)
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) return monthYear(first)
  if (a.getFullYear() === b.getFullYear()) return `${monthOnly(first)} / ${monthYear(last)}`
  return `${monthYear(first)} / ${monthYear(last)}`
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
