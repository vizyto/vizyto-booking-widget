import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { DayCounts, Slots } from '../api'
import { slotLabel } from '../api'
import { DOW, dayNum, monthMatrix, monthOf, monthTitle, spanLabel, weekday } from '../dates'
import { ChevronLeft, ChevronRight, Calendar, Grid, Moon, Sun, Sunrise, Bell } from '../ui/icons'
import { Spinner } from '../ui/Spinner'

// Day tiles flow to fill the available width: we measure the strip and show as
// many whole tiles as fit (MIN_TILE = narrowest a tile may get), then paginate
// the horizon in chunks of that many. Swiping left/right moves between chunks.
const MIN_TILE = 60
const GAP = 8
const SWIPE_THRESHOLD = 40

export function StepDateTime({
  days,
  counts,
  date,
  slots,
  loading,
  timezone,
  selectedSlot,
  onPickDate,
  onPickSlot,
  canWaitlist = false,
  onJoinWaitlist,
}: {
  days: string[]
  counts: DayCounts
  date: string
  slots: Slots
  loading: boolean
  timezone: string | null
  selectedSlot: string
  onPickDate: (d: string) => void
  onPickSlot: (k: string) => void
  // When a selected day has no free slots, offer to join the waitlist.
  canWaitlist?: boolean
  onJoinWaitlist?: () => void
}) {
  const [view, setView] = useState<'week' | 'month'>('week')
  const [perPage, setPerPage] = useState(7)
  const [page, setPage] = useState(0)
  const stripRef = useRef<HTMLDivElement | null>(null)
  const touchX = useRef<number | null>(null)
  const swiped = useRef(false)
  const inHorizon = useMemo(() => new Set(days), [days])

  // Measure how many tiles fit and keep it in sync with the strip width.
  useLayoutEffect(() => {
    if (view !== 'week') return
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
  }, [view])

  const maxPage = Math.max(0, Math.ceil(days.length / perPage) - 1)
  // Keep the page in range when the horizon shrinks or more tiles now fit.
  useEffect(() => {
    setPage((p) => Math.min(p, maxPage))
  }, [maxPage])

  // distinct months covered by the horizon, for month-view navigation
  const months = useMemo(() => {
    const seen: string[] = []
    const out: { year: number; month: number }[] = []
    for (const d of days) {
      const m = monthOf(d)
      const key = `${m.year}-${m.month}`
      if (!seen.includes(key)) {
        seen.push(key)
        out.push(m)
      }
    }
    return out
  }, [days])
  const [mIdx, setMIdx] = useState(0)

  const free = (d: string) => (counts[d] ?? 0) > 0

  const safePage = Math.min(page, maxPage)
  const pageDays = days.slice(safePage * perPage, safePage * perPage + perPage)
  const label =
    view === 'week'
      ? pageDays.length
        ? spanLabel(pageDays[0], pageDays[pageDays.length - 1])
        : ''
      : monthTitle(months[mIdx]?.year ?? 0, months[mIdx]?.month ?? 0)

  const goPrev = () => (view === 'week' ? setPage((p) => Math.max(0, p - 1)) : setMIdx((i) => Math.max(0, i - 1)))
  const goNext = () =>
    view === 'week' ? setPage((p) => Math.min(maxPage, p + 1)) : setMIdx((i) => Math.min(months.length - 1, i + 1))
  const prevDisabled = view === 'week' ? safePage === 0 : mIdx === 0
  const nextDisabled = view === 'week' ? safePage >= maxPage : mIdx >= months.length - 1

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

  const groups = useMemo(() => {
    const keys = Object.keys(slots)
      .filter((k) => (slots[k] ?? []).length > 0)
      .sort()
    const g: { label: string; Icon: typeof Sun; items: { k: string; lab: string }[] }[] = [
      { label: 'Rano', Icon: Sunrise, items: [] },
      { label: 'Południe', Icon: Sun, items: [] },
      { label: 'Wieczór', Icon: Moon, items: [] },
    ]
    for (const k of keys) {
      const lab = slotLabel(date, k, timezone)
      const h = parseInt(lab.slice(0, 2), 10)
      g[h < 12 ? 0 : h < 17 ? 1 : 2].items.push({ k, lab })
    }
    return g.filter((x) => x.items.length)
  }, [slots, date, timezone])

  return (
    <div class="vz-fade-in">
      <div class="vz-cal-head">
        <span class="vz-cal-month"><Calendar size={16} /> {label}</span>
        <button class="vz-cal-nav" onClick={goPrev} disabled={prevDisabled} aria-label="Poprzedni" type="button"><ChevronLeft size={18} /></button>
        <button class="vz-cal-nav" onClick={goNext} disabled={nextDisabled} aria-label="Następny" type="button"><ChevronRight size={18} /></button>
      </div>

      <div class="vz-toggle" role="tablist">
        <button class={view === 'week' ? 'on' : ''} onClick={() => setView('week')} type="button"><Calendar size={15} /> Tydzień</button>
        <button class={view === 'month' ? 'on' : ''} onClick={() => setView('month')} type="button"><Grid size={15} /> Miesiąc</button>
      </div>

      {view === 'week' ? (
        <div class="vz-days" ref={stripRef} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {pageDays.map((d) => {
            const f = free(d)
            return (
              <button class={`vz-day ${d === date ? 'active' : ''}${f ? '' : ' is-disabled'}`} aria-disabled={f ? undefined : 'true'} aria-current={d === date ? 'true' : undefined} onClick={() => { if (swiped.current) { swiped.current = false; return } if (f) onPickDate(d) }} type="button">
                <small>{weekday(d)}</small>
                {dayNum(d)}
                <span class={`vz-free${f ? '' : ' ghost'}`} />
              </button>
            )
          })}
        </div>
      ) : (
        <div>
          <div class="vz-month">
            {DOW.map((d) => <div class="vz-month-dow">{d}</div>)}
            {monthMatrix(months[mIdx]?.year ?? 0, months[mIdx]?.month ?? 0).flat().map((d) => {
              if (!d) return <div class="vz-mcell empty" />
              const bookable = inHorizon.has(d) && free(d)
              return (
                <button class={`vz-mcell ${d === date ? 'active' : ''}`} disabled={!bookable} aria-current={d === date ? 'true' : undefined} onClick={() => onPickDate(d)} type="button">
                  {dayNum(d)}
                  {bookable && <span class="vz-free" />}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {!date ? (
        <div class="vz-muted" style="margin-top:20px;text-align:center;">Wybierz dzień, aby zobaczyć wolne godziny.</div>
      ) : loading ? (
        <div class="vz-center"><Spinner /> Szukam wolnych godzin…</div>
      ) : groups.length === 0 ? (
        <div style="margin-top:20px;text-align:center;">
          <div class="vz-muted">Brak dostępnych terminów tego dnia. Wybierz inny.</div>
          {canWaitlist && onJoinWaitlist && (
            <button class="vz-btn ghost mt" onClick={onJoinWaitlist} type="button">
              <Bell size={17} /> Powiadom mnie, gdy się zwolni
            </button>
          )}
        </div>
      ) : (
        <>
          {groups.map((g) => (
            <div class="vz-slot-group">
              <div class="vz-slot-group-h"><g.Icon size={16} /> {g.label}</div>
              <div class="vz-slots vz-stagger">
                {g.items.map(({ k, lab }) => (
                  <button class={`vz-slot${k === selectedSlot ? ' selected' : ''}`} onClick={() => onPickSlot(k)} type="button">{lab}</button>
                ))}
              </div>
            </div>
          ))}
          {canWaitlist && onJoinWaitlist && (
            <button class="vz-wl-link" onClick={onJoinWaitlist} type="button">
              <Bell size={14} /> Nie pasuje żaden termin? Powiadom mnie, gdy się zwolni.
            </button>
          )}
        </>
      )}
    </div>
  )
}
