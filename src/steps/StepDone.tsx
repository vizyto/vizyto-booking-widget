import { SummaryCard, type SummaryRow } from '../ui/SummaryCard'
import { Button } from '../ui/Button'
import { Check } from '../ui/icons'

export function StepDone({
  rows,
  phone,
  email,
  onClose,
  onRestart,
}: {
  rows: SummaryRow[]
  phone: string
  email: string
  onClose?: () => void
  onRestart: () => void
}) {
  return (
    <div class="vz-done vz-fade-in">
      <div class="vz-check"><Check size={30} /></div>
      <div class="vz-done-title">Zarezerwowane!</div>
      <div class="vz-done-sub">
        {phone ? (
          <>Potwierdzenie SMS wyślemy na <b style="color:var(--vz-text)">{phone}</b>{email ? <> oraz na {email}</> : null}.</>
        ) : email ? (
          <>Potwierdzenie wyślemy na {email}.</>
        ) : (
          <>Potwierdzenie wyślemy wkrótce.</>
        )}
      </div>
      <div style="margin-top:18px;text-align:left;">
        <SummaryCard rows={rows} />
      </div>
      {onClose ? <Button onClick={onClose}>Gotowe</Button> : <Button variant="ghost" onClick={onRestart}>Nowa rezerwacja</Button>}
    </div>
  )
}
