import { SummaryCard, type SummaryRow } from '../ui/SummaryCard'
import { Button } from '../ui/Button'
import { Check, Clock } from '../ui/icons'
import type { LoyaltyCatalogReward, LoyaltyProgramPublic, LoyaltyWallet, PriceQuote } from '../api'
import { LoyaltyProgramBlock } from './LoyaltyProgram'

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
  quote,
  status,
  email,
  kind = 'service',
  onClose,
  onRestart,
  loyalty,
}: {
  rows: SummaryRow[]
  quote?: PriceQuote | null
  status: string | null
  email: string
  /** A class sign-up is never "pending" and is not called a "rezerwacja". */
  kind?: 'service' | 'class' | 'rental' | 'table'
  onClose?: () => void
  onRestart: () => void
  /**
   * The business's active loyalty program (vizyto #471 F37) and, when the
   * customer already has a card here, where they stand. Never a promise of
   * Points for this booking: staff award them at settlement.
   */
  loyalty?: { program: LoyaltyProgramPublic; wallet: LoyaltyWallet | null; catalog: readonly LoyaltyCatalogReward[] } | null
}) {
  const pending = status === 'pending'
  const isClass = kind === 'class'
  // A restaurant is not a salon: the pending copy names the venue the guest booked.
  const place = kind === 'table' ? { who: 'Lokal', where: 'w lokalu' } : { who: 'Salon', where: 'w salonie' }
  return (
    <div class="vz-done vz-fade-in">
      <div class={pending ? 'vz-check warn' : 'vz-check'}>{pending ? <Clock size={30} /> : <Check size={30} />}</div>
      <div class="vz-done-title">{isClass ? 'Zapisano!' : pending ? 'Rezerwacja wysłana!' : 'Zarezerwowane!'}</div>
      <div class="vz-done-sub">
        {pending ? (
          email
            ? <>{place.who} musi ją jeszcze potwierdzić. O potwierdzeniu poinformujemy Cię e-mailem na <b style="color:var(--vz-text)">{email}</b>.</>
            // No e-mail = no channel we can honestly promise (SMS confirmations
            // are off by default) - point at the salon instead.
            : <>{place.who} musi ją jeszcze potwierdzić. Status poznasz bezpośrednio {place.where}.</>
        ) : email ? (
          <>Potwierdzenie wyślemy na <b style="color:var(--vz-text)">{email}</b>.</>
        ) : isClass ? (
          // A class register with no e-mail has no channel we can promise: the
          // event reaches the in-app inbox, which a guest from a widget does not
          // have. Say what IS true instead of implying a message.
          <>Pokaż ten ekran na miejscu - Twoje miejsce jest zajęte.</>
        ) : (
          <>Szczegóły rezerwacji znajdziesz poniżej.</>
        )}
      </div>
      <div style="margin-top:18px;text-align:left;">
        <SummaryCard rows={rows} quote={quote} />
        {loyalty && <LoyaltyProgramBlock program={loyalty.program} wallet={loyalty.wallet} catalog={loyalty.catalog} />}
      </div>
      {onClose ? <Button onClick={onClose}>Gotowe</Button> : <Button variant="ghost" onClick={onRestart}>{isClass ? 'Nowy zapis' : 'Nowa rezerwacja'}</Button>}
    </div>
  )
}
