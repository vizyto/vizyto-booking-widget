import { SummaryCard, type SummaryRow } from '../ui/SummaryCard'
import { Button } from '../ui/Button'
import { Check, Clock } from '../ui/icons'

/**
 * Success screen. Status-aware: a business with manual confirmation returns the
 * booking as 'pending' - announcing "Zarezerwowane!" then would promise
 * something the salon hasn't agreed to yet.
 *
 * Channel copy is honest about the defaults: e-mail confirmations are on by
 * default, SMS confirmations are NOT - so we never promise an SMS.
 */
export function StepDone({
  rows,
  status,
  phone,
  email,
  onClose,
  onRestart,
}: {
  rows: SummaryRow[]
  status: string | null
  phone: string
  email: string
  onClose?: () => void
  onRestart: () => void
}) {
  const pending = status === 'pending'
  return (
    <div class="vz-done vz-fade-in">
      <div class={pending ? 'vz-check warn' : 'vz-check'}>{pending ? <Clock size={30} /> : <Check size={30} />}</div>
      <div class="vz-done-title">{pending ? 'Rezerwacja wysłana!' : 'Zarezerwowane!'}</div>
      <div class="vz-done-sub">
        {pending ? (
          email
            ? <>Salon musi ją jeszcze potwierdzić. O potwierdzeniu poinformujemy Cię e-mailem na <b style="color:var(--vz-text)">{email}</b>.</>
            : <>Salon musi ją jeszcze potwierdzić. Damy Ci znać, gdy to zrobi.</>
        ) : email ? (
          <>Potwierdzenie wyślemy na <b style="color:var(--vz-text)">{email}</b>.</>
        ) : phone ? (
          <>Szczegóły rezerwacji znajdziesz poniżej.</>
        ) : (
          <>Szczegóły rezerwacji znajdziesz poniżej.</>
        )}
      </div>
      <div style="margin-top:18px;text-align:left;">
        <SummaryCard rows={rows} />
      </div>
      {onClose ? <Button onClick={onClose}>Gotowe</Button> : <Button variant="ghost" onClick={onRestart}>Nowa rezerwacja</Button>}
    </div>
  )
}
