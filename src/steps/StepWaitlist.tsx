import { useState } from 'preact/hooks'
import { StepHeader } from '../ui/StepHeader'
import { Button } from '../ui/Button'
import { Bell, Sparkles, Sunrise, Sun, Moon } from '../ui/icons'
import { dayMonth } from '../dates'

export type WaitlistPrefs = { rangeDays: number; timeFrom: string | null; timeTo: string | null }

const RANGES = [
  { days: 1, label: 'Ten dzień' },
  { days: 3, label: '3 dni' },
  { days: 7, label: 'Tydzień' },
  { days: 14, label: '2 tygodnie' },
]

const WINDOWS: { key: string; label: string; sub: string; Icon: typeof Sun; timeFrom: string | null; timeTo: string | null }[] = [
  { key: 'any', label: 'Dowolna', sub: 'cały dzień', Icon: Sparkles, timeFrom: null, timeTo: null },
  { key: 'morning', label: 'Rano', sub: 'do 12:00', Icon: Sunrise, timeFrom: '06:00', timeTo: '12:00' },
  { key: 'afternoon', label: 'Popołudnie', sub: '12:00–17:00', Icon: Sun, timeFrom: '12:00', timeTo: '17:00' },
  { key: 'evening', label: 'Wieczór', sub: 'od 17:00', Icon: Moon, timeFrom: '17:00', timeTo: null },
]

// Add whole days to a YYYY-MM-DD string in UTC, so DST never shifts the result.
const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function StepWaitlist({
  serviceName,
  workerName,
  date,
  onSubmit,
  busy,
  error,
}: {
  serviceName: string
  workerName: string
  date: string
  onSubmit: (prefs: WaitlistPrefs) => void
  busy: boolean
  error?: string
}) {
  const [rangeDays, setRangeDays] = useState(3)
  const [win, setWin] = useState('any')

  const selectedWin = WINDOWS.find((w) => w.key === win) ?? WINDOWS[0]

  return (
    <div class="vz-fade-in">
      <StepHeader title="Powiadom o wolnym terminie" />
      <p class="vz-lead" style="margin:-4px 0 16px;">
        Powiadomimy Cię, gdy tylko zwolni się pasujący termin usługi <b style="color:var(--vz-text)">{serviceName}</b> ({workerName}).
      </p>

      <div class="vz-wl-label">Od {dayMonth(date)}</div>
      <div class="vz-wl-grid">
        {RANGES.map((r) => (
          <button
            class={`vz-wl-opt${rangeDays === r.days ? ' on' : ''}`}
            onClick={() => setRangeDays(r.days)}
            type="button"
          >
            <span class="vz-wl-opt-t">{r.label}</span>
            <span class="vz-wl-opt-s">do {dayMonth(addDays(date, r.days - 1))}</span>
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

      {error && <div class="vz-err" role="alert">{error}</div>}

      <Button onClick={() => onSubmit({ rangeDays, timeFrom: selectedWin.timeFrom, timeTo: selectedWin.timeTo })} loading={busy}>
        <Bell size={17} /> {busy ? 'Zapisuję…' : 'Powiadom mnie'}
      </Button>
    </div>
  )
}
