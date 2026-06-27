import { useMemo, useState } from 'preact/hooks'
import type { DayCounts, Slots } from '../api'
import { slotLabel } from '../api'
import { DOW, dayNum, monthMatrix, monthOf, monthTitle, spanLabel, weekday } from '../dates'
import { ChevronLeft, ChevronRight, Calendar, Grid, Moon, Sun, Sunrise } from '../ui/icons'
import { Spinner } from '../ui/Spinner'

const WEEK = 7

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
}) {
  const [view, setView] = useState<'week' | 'month'>('week')
  const [week, setWeek] = useState(0)
  const maxWeek = Math.max(0, Math.ceil(days.length / WEEK) - 1)
  const inHorizon = useMemo(() => new Set(days), [days])

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

  const weekDays = days.slice(week * WEEK, week * WEEK + WEEK)
  const label =
    view === 'week'
      ? weekDays.length
        ? spanLabel(weekDays[0], weekDays[weekDays.length - 1])
        : ''
      : monthTitle(months[mIdx]?.year ?? 0, months[mIdx]?.month ?? 0)

  const goPrev = () => (view === 'week' ? setWeek((w) => Math.max(0, w - 1)) : setMIdx((i) => Math.max(0, i - 1)))
  const goNext = () =>
    view === 'week' ? setWeek((w) => Math.min(maxWeek, w + 1)) : setMIdx((i) => Math.min(months.length - 1, i + 1))
  const prevDisabled = view === 'week' ? week === 0 : mIdx === 0
  const nextDisabled = view === 'week' ? week >= maxWeek : mIdx >= months.length - 1

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
        <div class="vz-days">
          {weekDays.map((d) => {
            const f = free(d)
            return (
              <button class={`vz-day ${d === date ? 'active' : ''}`} disabled={!f} aria-current={d === date ? 'true' : undefined} onClick={() => onPickDate(d)} type="button">
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
        <div class="vz-muted" style="margin-top:20px;text-align:center;">Brak dostępnych terminów tego dnia. Wybierz inny.</div>
      ) : (
        groups.map((g) => (
          <div class="vz-slot-group">
            <div class="vz-slot-group-h"><g.Icon size={16} /> {g.label}</div>
            <div class="vz-slots vz-stagger">
              {g.items.map(({ k, lab }) => (
                <button class={`vz-slot${k === selectedSlot ? ' selected' : ''}`} onClick={() => onPickSlot(k)} type="button">{lab}</button>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
