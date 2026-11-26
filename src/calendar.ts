// The rules of the month calendar and of the hour list, without any rendering:
// which months a horizon covers, which weeks of a month are shown, how full a day
// is, and which part of the day an hour belongs to. One wording and one set of
// numbers with the app (vizyto packages/shared: `getAvailabilityLevel`,
// `slotDayParts`, `BookingMonthCalendar`).
import { monthMatrix, monthOf } from './dates'

export type AvailabilityLevel = 'high' | 'medium' | 'low' | 'none'

/** The app's thresholds: 12 free starts and more is plenty, 5 and more is some. */
export function availabilityLevel(count: number | null | undefined): AvailabilityLevel {
  if (!count || count <= 0) return 'none'
  if (count >= 12) return 'high'
  return count >= 5 ? 'medium' : 'low'
}

/** The months a horizon (ordered YYYY-MM-DD days) covers, in order. */
export function horizonMonths(days: string[]): { year: number; month: number }[] {
  const seen = new Set<string>()
  const out: { year: number; month: number }[] = []
  for (const d of days) {
    const key = d.slice(0, 7)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(monthOf(d))
  }
  return out
}

/**
 * The cells of one month, Monday first ('' = outside the month), without the
 * weeks that lie wholly before `first` (the first day that can be picked). The
 * week of `first` stays whole, so the grid still reads as a calendar, and the
 * last week always stays, so a month is never empty.
 */
export function monthCells(year: number, month: number, first: string): string[] {
  const weeks = monthMatrix(year, month)
  let live = 0
  while (live < weeks.length - 1 && weeks[live]!.every((d) => !d || d < first)) live++
  return weeks.slice(live).flat()
}

/** The time-of-day sections of a slot list. */
export const DAY_PARTS = ['Rano', 'Popołudnie', 'Wieczór'] as const

/** Morning ends at 12:00, evening starts at 18:00 (the slot's LOCAL hour). */
export const dayPartIndex = (hour: number): 0 | 1 | 2 => (hour < 12 ? 0 : hour < 18 ? 1 : 2)
