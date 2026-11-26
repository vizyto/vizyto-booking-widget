import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { availabilityLevel, horizonMonths, monthCells, type AvailabilityLevel } from '../calendar'
import { dayNum, fullDate, monthOf, monthTitle } from '../dates'
import { ChevronLeft, ChevronRight } from './icons'

/**
 * The month calendar of every "when" step (visit, rental, table), the widget's
 * copy of the app's BookingMonthCalendar ("Czysty miesiąc", vizyto #1168): a
 * whole month of round day cells on the fill surface, no frames, no week strip
 * and no view tabs. A day carries a bar that tells how much of it is free in
 * three levels (colour AND length), a promoted day a dot in its corner.
 *
 * The horizon (`days`) decides which months exist and which days can be picked;
 * weeks wholly behind the first horizon day are left out, so late in a month the
 * hours stay on screen instead of rows of grey.
 */
const DOW = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd']
const SWIPE_THRESHOLD = 50

// Spoken equivalent of the bar: its colour and length say nothing to a screen reader.
const BAR_LABELS: Record<Exclude<AvailabilityLevel, 'none'>, string> = {
  high: 'dużo wolnych terminów',
  medium: 'kilka wolnych terminów',
  low: 'ostatnie wolne terminy',
}

const upperFirst = (s: string) => s.charAt(0).toLocaleUpperCase('pl-PL') + s.slice(1)

export function MonthCalendar({
  days,
  counts,
  date,
  onPickDate,
  mark,
  emptyTappable = false,
}: {
  /** The bookable horizon, ordered YYYY-MM-DD. */
  days: string[]
  counts: Record<string, number>
  date: string
  onPickDate: (d: string) => void
  /** A day's promotion badge (#430); the cell shows a dot, the caption names it. */
  mark?: (d: string) => string | null
  /**
   * A day without a free start stays tappable (tables: that is where the empty
   * state and "Powiadom mnie" live). Default: such a day is greyed out.
   */
  emptyTappable?: boolean
}) {
  const months = useMemo(() => horizonMonths(days), [days])
  const inHorizon = useMemo(() => new Set(days), [days])
  const [mIdx, setMIdx] = useState(0)

  // The shown month follows a date set from outside (the "najbliższy wolny termin"
  // jump, the first free day a rental picks), never the other way round.
  useEffect(() => {
    if (!date || !inHorizon.has(date)) return
    const m = monthOf(date)
    const i = months.findIndex((x) => x.year === m.year && x.month === m.month)
    if (i >= 0) setMIdx(i)
  }, [date, inHorizon, months])

  const idx = Math.min(mIdx, Math.max(0, months.length - 1))
  const shown = months[idx]
  const cells = useMemo(
    () => (shown ? monthCells(shown.year, shown.month, days[0] ?? '') : []),
    [shown, days],
  )

  const prevDisabled = idx === 0
  const nextDisabled = idx >= months.length - 1
  const goPrev = () => setMIdx(Math.max(0, idx - 1))
  const goNext = () => setMIdx(Math.min(months.length - 1, idx + 1))

  const touchX = useRef<number | null>(null)
  const swiped = useRef(false)
  const onTouchStart = (e: TouchEvent) => {
    touchX.current = e.touches[0]?.clientX ?? null
    swiped.current = false
  }
  const onTouchEnd = (e: TouchEvent) => {
    const start = touchX.current
    touchX.current = null
    if (start == null) return
    const dx = (e.changedTouches[0]?.clientX ?? start) - start
    if (Math.abs(dx) < SWIPE_THRESHOLD) return
    // A real swipe: the trailing click on a day must not pick a date.
    swiped.current = true
    if (dx < 0) {
      if (!nextDisabled) goNext()
    } else if (!prevDisabled) {
      goPrev()
    }
  }

  const pickable = (d: string) => inHorizon.has(d) && (emptyTappable || (counts[d] ?? 0) > 0)
  const badgeOf = (d: string) => (pickable(d) ? mark?.(d) ?? null : null)
  const anyBadge = cells.some((d) => !!d && !!badgeOf(d))

  if (!shown) return null
  return (
    <div class="vz-mon">
      <div class="vz-mon-head">
        <div class="vz-mon-title" aria-live="polite">{monthTitle(shown.year, shown.month)}</div>
        <button class="vz-mon-nav" onClick={goPrev} disabled={prevDisabled} aria-label="Poprzedni miesiąc" type="button"><ChevronLeft size={18} /></button>
        <button class="vz-mon-nav" onClick={goNext} disabled={nextDisabled} aria-label="Następny miesiąc" type="button"><ChevronRight size={18} /></button>
      </div>
      <div class="vz-mon-dow" aria-hidden="true">
        {DOW.map((d) => <span>{d}</span>)}
      </div>
      <div class="vz-mon-grid vz-fade-in" key={`${shown.year}-${shown.month}`} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {cells.map((d) => {
          if (!d) return <span aria-hidden="true" />
          const ok = pickable(d)
          const level = availabilityLevel(counts[d])
          const badge = badgeOf(d)
          const active = d === date
          const spoken = `${upperFirst(fullDate(d))}${ok && level !== 'none' ? `, ${BAR_LABELS[level]}` : ''}${badge ? `, promocja ${badge}` : ''}`
          return (
            <button
              class={`vz-mday${active ? ' active' : ''}`}
              disabled={!ok}
              aria-pressed={active ? 'true' : 'false'}
              aria-label={spoken}
              onClick={() => {
                if (swiped.current) { swiped.current = false; return }
                onPickDate(d)
              }}
              type="button"
            >
              {dayNum(d)}
              <span class="vz-mday-bar">{ok && level !== 'none' && <i class={level} />}</span>
              {badge && <span class="vz-mday-promo" aria-hidden="true" />}
            </button>
          )
        })}
      </div>
      {anyBadge && (
        <div class="vz-promo-caption"><span class="vz-promo-dot" aria-hidden="true" /> Dni z promocją</div>
      )}
    </div>
  )
}

/**
 * Which day the hours below belong to, and how many of them are free. The month
 * calendar shows no weekday next to the picked day, so the list names it.
 */
export function DayHeading({ date, count }: { date: string; count: number }) {
  return (
    <div class="vz-dayhead">
      <span class="vz-dayhead-t">{upperFirst(fullDate(date))}</span>
      <span class="vz-dayhead-n">Wolne terminy: {count}</span>
    </div>
  )
}
