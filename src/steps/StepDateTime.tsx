import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { VNode } from 'preact'
import type { DayCounts, Slots } from '../api'
import { slotLabel } from '../api'
import { DOW, dayNum, monthMatrix, monthOf, monthTitle, spanLabel, weekday } from '../dates'
import { ChevronDown, ChevronLeft, ChevronRight, Calendar, Grid, Moon, Sun, Sunrise, Bell } from '../ui/icons'
import { AvatarStack } from '../ui/AvatarStack'
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
  onFindNext,
  findingNext = false,
  noneAhead = false,
  chain,
  slotPicker,
  providerChip,
  emptyReason,
  onCheckAll,
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
  /** Jump to the first day that has a free chain start (server sweeps 60 days). */
  onFindNext?: () => void
  findingNext?: boolean
  /** Set once a search came back empty, so we stop offering it. */
  noneAhead?: boolean
  /** Chain plan for the picked slot - only meaningful for a multi-position cart. */
  chain?: { rows: { time: string; name: string; duration: string }[]; total: string } | null
  /** Who is free at the picked slot, when refining "Dowolny" makes sense. */
  slotPicker?: {
    candidates: { id: number; name: string; price: string }[]
    selectedId: number | null
    onPick: (id: number | null) => void
  } | null
  /**
   * Who the hours belong to, above the calendar. `editor` is the per-position
   * assignment list - present when the choice can still be changed from here.
   */
  providerChip?: {
    label: string
    people: { name: string; image: string | null }[]
    editor?: VNode | null
  }
  /** Why the day came back empty: 'busy' = these people are, others are not. */
  emptyReason?: 'busy'
  /** Drop every specialist pin and ask the day again. */
  onCheckAll?: () => void
}) {
  const [view, setView] = useState<'week' | 'month'>('week')
  const [editingWho, setEditingWho] = useState(false)
  // A date set from OUTSIDE (first-free jump) must bring its page into view -
  // otherwise the customer is told "znaleziono termin" and sees the same week.
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

  // Follow a date set from OUTSIDE the strip (the "najbliższy wolny termin"
  // jump): without this the customer is told a date was found and keeps looking
  // at the same week, with no tile marked active. Also switch the month view to
  // the month that actually holds it.
  useEffect(() => {
    if (!date) return
    const idx = days.indexOf(date)
    if (idx < 0) return
    setPage(Math.floor(idx / perPage))
    const m = monthOf(date)
    const mi = months.findIndex((x) => x.year === m.year && x.month === m.month)
    if (mi >= 0) setMIdx(mi)
  }, [date, days, perPage, months])

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
    const keys = slots.slice().sort()
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
      {providerChip && (
        <div class="vz-who">
          <button
            type="button"
            class={`vz-who-chip${editingWho ? ' on' : ''}`}
            disabled={!providerChip.editor}
            aria-expanded={providerChip.editor ? (editingWho ? 'true' : 'false') : undefined}
            onClick={() => providerChip.editor && setEditingWho((v) => !v)}
          >
            <AvatarStack people={providerChip.people} max={3} />
            <span class="vz-who-label">{providerChip.label}</span>
            {providerChip.editor && <ChevronDown size={16} class="vz-chip-cv" />}
          </button>
          {editingWho && providerChip.editor}
        </div>
      )}

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
        <div style="margin-top:20px;text-align:center;">
          <div class="vz-muted">Wybierz dzień, aby zobaczyć wolne godziny.</div>
          {/* Whole horizon without a free day: the strip has nothing selectable,
              so the way out has to live here too. */}
          {onFindNext && !noneAhead && !Object.values(counts).some((n) => n > 0) && (
            <button class="vz-btn ghost mt" onClick={onFindNext} disabled={findingNext} type="button">
              {findingNext ? <><Spinner /> Szukam najbliższego terminu…</> : 'Znajdź najbliższy dostępny termin'}
            </button>
          )}
        </div>
      ) : loading ? (
        <div class="vz-center"><Spinner /> Szukam wolnych godzin…</div>
      ) : groups.length === 0 ? (
        <div style="margin-top:20px;text-align:center;">
          {/* Two different empty days, two different ways out: the chosen people
              being busy is not the same as the day being shut. */}
          {emptyReason === 'busy' ? (
            <>
              <div class="vz-muted">Wybrani specjaliści mają tego dnia zajęte grafiki.</div>
              <div class="vz-muted" style="margin-top:4px;">Dostępni są za to inni specjaliści.</div>
              {onCheckAll && (
                <button class="vz-btn ghost mt" onClick={onCheckAll} type="button">
                  Sprawdź wszystkich specjalistów
                </button>
              )}
            </>
          ) : (
            <>
              <div class="vz-muted">
                {noneAhead
                  ? 'Brak wolnych terminów w najbliższym czasie.'
                  : 'Brak dostępnych terminów tego dnia. Wybierz inny.'}
              </div>
              {/* Finding the next free day beats making the customer click through
                  the calendar - the server already sweeps 60 days for us. */}
              {onFindNext && !noneAhead && (
                <button class="vz-btn ghost mt" onClick={onFindNext} disabled={findingNext} type="button">
                  {findingNext ? <><Spinner /> Szukam najbliższego terminu…</> : 'Znajdź najbliższy dostępny termin'}
                </button>
              )}
            </>
          )}
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
          {/* "Dowolny" + a picked hour: name the exact price by naming the person.
              The list is who the ENGINE reported free at that slot. */}
          {slotPicker && slotPicker.candidates.length > 1 && (
            <div class="vz-chain">
              <div class="vz-chain-h">Kto wykona usługę</div>
              <div class="vz-slotpick" role="radiogroup" aria-label="Kto wykona usługę">
                <button
                  type="button"
                  role="radio"
                  aria-checked={slotPicker.selectedId == null}
                  class={`vz-slotpick-b${slotPicker.selectedId == null ? ' on' : ''}`}
                  onClick={() => slotPicker.onPick(null)}
                >
                  Dowolny
                </button>
                {slotPicker.candidates.map((c) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={slotPicker.selectedId === c.id}
                    class={`vz-slotpick-b${slotPicker.selectedId === c.id ? ' on' : ''}`}
                    onClick={() => slotPicker.onPick(c.id)}
                  >
                    {c.name} <span class="vz-slotpick-p">{c.price}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* What the visit will actually look like, once a start is picked. */}
          {chain && chain.rows.length > 1 && (
            <div class="vz-chain">
              <div class="vz-chain-h">Przebieg wizyty</div>
              {chain.rows.map((r) => (
                <div class="vz-chain-row">
                  <span class="vz-chain-time">{r.time}</span>
                  <span class="vz-chain-name">{r.name}</span>
                  <span class="vz-chain-dur">{r.duration}</span>
                </div>
              ))}
              <div class="vz-chain-total">Łącznie: {chain.total}</div>
            </div>
          )}
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
