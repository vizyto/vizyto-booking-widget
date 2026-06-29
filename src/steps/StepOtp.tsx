import { StepHeader } from '../ui/StepHeader'
import { OtpInput } from '../ui/OtpInput'
import { Turnstile } from '../ui/Turnstile'

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export function StepOtp({
  maskedPhone,
  code,
  onCode,
  onComplete,
  onResend,
  verifying,
  resending,
  error,
  now,
  expiresAt,
  resendAt,
  turnstileKey,
  turnstileToken,
  onTurnstile,
}: {
  maskedPhone: string
  code: string
  onCode: (v: string) => void
  onComplete: (v: string) => void
  onResend: () => void
  verifying: boolean
  resending: boolean
  error?: string
  now: number
  expiresAt: number
  resendAt: number
  turnstileKey?: string
  turnstileToken: string | null
  onTurnstile: (token: string | null) => void
}) {
  const secondsLeft = Math.max(0, Math.ceil((expiresAt - now) / 1000))
  const resendIn = Math.max(0, Math.ceil((resendAt - now) / 1000))
  const expired = secondsLeft <= 0

  return (
    <div class="vz-fade-in">
      <StepHeader title="Weryfikacja SMS" />
      <p class="vz-lead">
        Wpisaliśmy 4-cyfrowy kod na numer <b style="color:var(--vz-text)">{maskedPhone}</b>. Wpisz go poniżej.
      </p>

      <OtpInput value={code} onInput={onCode} onComplete={onComplete} disabled={verifying || expired} invalid={!!error} />

      <div aria-live="assertive">
        {error && <div class="vz-err" role="alert">{error}</div>}
        {expired && !error && <div class="vz-err" role="alert">Kod wygasł. Wyślij nowy.</div>}
      </div>

      <div class="vz-hint" aria-live="polite">
        {verifying ? (
          'Sprawdzam kod…'
        ) : !expired ? (
          <>Kod ważny jeszcze <b>{mmss(secondsLeft)}</b></>
        ) : null}
      </div>

      {turnstileKey && (
        <div class="vz-turnstile-wrap" style="display:flex;justify-content:center;margin-top:16px;">
          <Turnstile siteKey={turnstileKey} onToken={onTurnstile} />
        </div>
      )}

      <button
        class="vz-link"
        onClick={onResend}
        disabled={resendIn > 0 || resending || (!!turnstileKey && !turnstileToken)}
        type="button"
        style="display:block;margin:16px auto 0;"
      >
        {resending ? 'Wysyłam…' : resendIn > 0 ? `Wyślij ponownie (${resendIn}s)` : 'Wyślij kod ponownie'}
      </button>
    </div>
  )
}
