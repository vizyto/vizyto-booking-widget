import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { dayNum, spanLabel, weekday } from '../dates'
import { PromoBadge } from './PromoBadge'

/**
 * The horizontal day picker, shared by the visit calendar and the rental one.
 *
 * Day tiles flow to fill the available width: the strip is measured and shows as
 * many whole tiles as fit (MIN_TILE = narrowest a tile may get), then paginates
 * the horizon in chunks of that many. Swiping left/right moves between chunks.
 * Rendering the whole horizon in one row instead - 42 tiles inside a 400px panel -
 * squeezes every tile to a few pixels and the weekday labels collide, which is
 * exactly what the rental step did before this was pulled out of StepDateTime.
 */
const MIN_TILE = 60
const GAP = 8
const SWIPE_THRESHOLD = 40

export type DayPager = ReturnType<typeof useDayPager>

/**
 * Paging state for a day strip. `active` is false while the caller shows another
 * view (the month grid) - measuring a hidden strip reads 0 and would thrash.
 */
export function useDayPager(days: string[], date: string, active = true) {
  const [perPage, setPerPage] = useState(7)
  const [page, setPage] = useState(0)
  const stripRef = useRef<HTMLDivElement | null>(null)
  const touchX = useRef<number | null>(null)
  const swiped = useRef(false)

  // Measure how many tiles fit and keep it in sync with the strip width.
  useLayoutEffect(() => {
    if (!active) return
    const el = stripRef.current
    if (!el) return
    const measure = () => {
      const w = el.clientWidth
      if (!w) return
      const n = Math.max(1, Math.floor((w + GAP) / (MIN_TILE + GAP)))
      setPerPage((prev) => (prev === n ? prev : n))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [active])

  const maxPage = Math.max(0, Math.ceil(days.length / perPage) - 1)
  // Keep the page in range when the horizon shrinks or more tiles now fit.
  useEffect(() => {
    setPage((p) => Math.min(p, maxPage))
  }, [maxPage])

  // A date set from OUTSIDE the strip (the "najbliższy wolny termin" jump, or the
  // first free day a rental auto-selects) must bring its page into view -
  // otherwise the customer is told a date was found and keeps looking at the same
  // week, with no tile marked active.
  useEffect(() => {
    if (!date) return
    const idx = days.indexOf(date)
    if (idx < 0) return
    setPage(Math.floor(idx / perPage))
  }, [date, days, perPage])

  const safePage = Math.min(page, maxPage)
  const pageDays = days.slice(safePage * perPage, safePage * perPage + perPage)
  const label = pageDays.length ? spanLabel(pageDays[0]!, pageDays[pageDays.length - 1]!) : ''
  const prevDisabled = safePage === 0
  const nextDisabled = safePage >= maxPage
  const goPrev = () => setPage((p) => Math.max(0, p - 1))
  const goNext = () => setPage((p) => Math.min(maxPage, p + 1))

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
    // A real swipe: flag it so the trailing click on a day tile doesn't pick a date.
    swiped.current = true
    if (dx < 0) {
      if (!nextDisabled) goNext()
    } else if (!prevDisabled) {
      goPrev()
    }
  }

  return { stripRef, pageDays, label, prevDisabled, nextDisabled, goPrev, goNext, onTouchStart, onTouchEnd, swiped }
}

/**
 * The tiles themselves. Paging, measuring and swiping live in the pager.
 *
 * `mark` returns a day's promotion badge (#430): it sits in the tile's corner, and
 * only a page that shows one leaves room above its row for it (`.has-promo`).
 */
export function DayStrip({
  pager,
  counts,
  date,
  onPickDate,
  mark,
}: {
  pager: DayPager
  counts: Record<string, number>
  date: string
  onPickDate: (d: string) => void
  mark?: (d: string) => string | null
}) {
  const free = (d: string) => (counts[d] ?? 0) > 0
  const marked = !!mark && pager.pageDays.some((d) => !!mark(d))
  return (
    <div
      class={`vz-days${marked ? ' has-promo' : ''}`}
      ref={pager.stripRef}
      onTouchStart={pager.onTouchStart}
      onTouchEnd={pager.onTouchEnd}
    >
      {pager.pageDays.map((d) => {
        const f = free(d)
        const badge = mark?.(d) ?? null
        return (
          <button
            class={`vz-day ${d === date ? 'active' : ''}${f ? '' : ' is-disabled'}`}
            aria-label={badge ? `${weekday(d)} ${dayNum(d)}, promocja ${badge}` : undefined}
            aria-disabled={f ? undefined : 'true'}
            aria-current={d === date ? 'true' : undefined}
            onClick={() => {
              if (pager.swiped.current) { pager.swiped.current = false; return }
              if (f) onPickDate(d)
            }}
            type="button"
          >
            <small>{weekday(d)}</small>
            {dayNum(d)}
            <span class={`vz-free${f ? '' : ' ghost'}`} />
            {badge && <PromoBadge corner>{badge}</PromoBadge>}
          </button>
        )
      })}
    </div>
  )
}
