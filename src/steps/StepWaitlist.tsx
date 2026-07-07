import { useEffect, useMemo, useState } from 'preact/hooks'
import { StepHeader } from '../ui/StepHeader'
import { Button } from '../ui/Button'
import { Bell, Sparkles, Sunrise, Sun, Moon } from '../ui/icons'
import { dayMonth, ymd } from '../dates'
import type { WaitlistCheck } from '../api'

export type WaitlistPrefs = { startOffset: number; rangeDays: number; timeFrom: string | null; timeTo: string | null }

type RangeOption = { key: string; label: string; startOffset: number; days: number }

// Window presets anchored on the browsed day. "Jutro" only makes sense when
// the customer is looking at today - otherwise "Ten dzień" covers the intent.
const buildRanges = (date: string): RangeOption[] => {
  const isToday = date === ymd(new Date())
  return [
    { key: 'day', label: isToday ? 'Dziś' : 'Ten dzień', startOffset: 0, days: 1 },
    ...(isToday ? [{ key: 'tomorrow', label: 'Jutro', startOffset: 1, days: 1 }] : []),
    { key: '3d', label: '3 dni', startOffset: 0, days: 3 },
    { key: '7d', label: 'Tydzień', startOffset: 0, days: 7 },
    { key: '14d', label: '2 tygodnie', startOffset: 0, days: 14 },
    { key: '30d', label: 'Miesiąc', startOffset: 0, days: 30 },
  ]
}

const WINDOWS: { key: string; label: string; sub: string; Icon: typeof Sun; timeFrom: string | null; timeTo: string | null }[] = [
  { key: 'any', label: 'Dowolna', sub: 'cały dzień', Icon: Sparkles, timeFrom: null, timeTo: null },
  { key: 'morning', label: 'Rano', sub: 'do 12:00', Icon: Sunrise, timeFrom: '06:00', timeTo: '12:00' },
  { key: 'afternoon', label: 'Popołudnie', sub: '12:00-17:00', Icon: Sun, timeFrom: '12:00', timeTo: '17:00' },
  { key: 'evening', label: 'Wieczór', sub: 'od 17:00', Icon: Moon, timeFrom: '17:00', timeTo: '22:00' },
]

// Add whole days to a YYYY-MM-DD string in UTC, so DST never shifts the result.
const addDays = (ymdStr: string, n: number) => {
  const d = new Date(`${ymdStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function StepWaitlist({
  serviceName,
  workerName,
  date,
  onSubmit,
  onShowSlots,
  check,
  busy,
  error,
}: {
  serviceName: string
  workerName: string
  date: string
  onSubmit: (prefs: WaitlistPrefs) => void
  /** The chosen window turned out to have free slots - jump the calendar there. */
  onShowSlots: (date: string) => void
  /** Pre-check: does the prospective window already have a bookable slot? */
  check: (win: { dateFrom: string; dateTo: string; timeFrom: string | null; timeTo: string | null }) => Promise<WaitlistCheck>
  busy: boolean
  error?: string
}) {
  const ranges = useMemo(() => buildRanges(date), [date])
  const [rangeKey, setRangeKey] = useState('3d')
  const [win, setWin] = useState('any')

  const selectedRange = ranges.find((r) => r.key === rangeKey) ?? ranges[0]
  const selectedWin = WINDOWS.find((w) => w.key === win) ?? WINDOWS[0]

  const dateFrom = addDays(date, selectedRange.startOffset)
  const dateTo = addDays(dateFrom, selectedRange.days - 1)

  // The waitlist is a fallback: when the chosen window still has a bookable
  // slot, steer to the calendar instead of accepting the signup. The server
  // enforces the same gate on join, so this is purely a better path, not a lock.
  const [found, setFound] = useState<WaitlistCheck | null>(null)
  useEffect(() => {
    let alive = true
    setFound(null)
    check({ dateFrom, dateTo, timeFrom: selectedWin.timeFrom, timeTo: selectedWin.timeTo })
      .then((r) => {
        if (alive && r.available && r.date) setFound(r)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [dateFrom, dateTo, selectedWin.timeFrom, selectedWin.timeTo])

  return (
    <div class="vz-fade-in">
      <StepHeader title="Powiadom o wolnym terminie" />
      <p class="vz-lead" style="margin:-4px 0 16px;">
        Powiadomimy Cię, gdy tylko zwolni się pasujący termin usługi <b style="color:var(--vz-text)">{serviceName}</b> ({workerName}).
      </p>

      <div class="vz-wl-label">Od {dayMonth(dateFrom)}</div>
      <div class="vz-wl-grid">
        {ranges.map((r) => (
          <button
            class={`vz-wl-opt${rangeKey === r.key ? ' on' : ''}`}
            onClick={() => setRangeKey(r.key)}
            type="button"
          >
            <span class="vz-wl-opt-t">{r.label}</span>
            <span class="vz-wl-opt-s">
              {r.days === 1 ? dayMonth(addDays(date, r.startOffset)) : `do ${dayMonth(addDays(date, r.startOffset + r.days - 1))}`}
            </span>
          </button>
        ))}
      </div>

      <div class="vz-wl-label" style="margin-top:16px;">Pora dnia</div>
      <div class="vz-wl-grid">
        {WINDOWS.map((w) => (
          <button
            class={`vz-wl-opt${win === w.key ? ' on' : ''}`}
            onClick={() => setWin(w.key)}
            type="button"
          >
            <span class="vz-wl-opt-t"><w.Icon size={14} /> {w.label}</span>
            <span class="vz-wl-opt-s">{w.sub}</span>
          </button>
        ))}
      </div>

      {found && (
        <div
          role="status"
          style="margin-top:16px; padding:12px 14px; border:1.5px solid var(--vz-accent); border-radius:12px; background:var(--vz-selected); font-size:13px; line-height:1.45;"
        >
          <b>W tym zakresie są wolne terminy.</b>
          <br />
          Najbliższy: {dayMonth(found.date!)} o {found.time}. Zarezerwuj go, zamiast czekać.
        </div>
      )}

      {error && <div class="vz-err" role="alert">{error}</div>}

      {found ? (
        <Button onClick={() => onShowSlots(found.date!)}>Pokaż terminy</Button>
      ) : (
        <Button
          onClick={() => onSubmit({ startOffset: selectedRange.startOffset, rangeDays: selectedRange.days, timeFrom: selectedWin.timeFrom, timeTo: selectedWin.timeTo })}
          loading={busy}
        >
          <Bell size={17} /> {busy ? 'Zapisuję…' : 'Powiadom mnie'}
        </Button>
      )}
    </div>
  )
}
