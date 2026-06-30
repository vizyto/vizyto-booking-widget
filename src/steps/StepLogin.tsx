import { useState } from 'preact/hooks'
import type { OAuthProvider } from '../api'
import { StepHeader } from '../ui/StepHeader'
import { Field } from '../ui/Field'
import { Button } from '../ui/Button'
import { Spinner } from '../ui/Spinner'
import { AppleLogo, FacebookF, GoogleG } from '../ui/icons'

const PROVIDERS: { id: OAuthProvider; label: string; Icon: (p: { size?: number }) => any }[] = [
  { id: 'google', label: 'Google', Icon: GoogleG },
  { id: 'apple', label: 'Apple', Icon: AppleLogo },
  { id: 'facebook', label: 'Facebook', Icon: FacebookF },
]

export function StepLogin({
  email,
  prefillReason,
  onChangeEmail,
  onSubmit,
  onOAuth,
  oauthBusy,
  onBackToGuest,
  loggingIn,
  error,
}: {
  email: string
  prefillReason?: string
  onChangeEmail: (v: string) => void
  onSubmit: (email: string, password: string) => void
  onOAuth: (p: OAuthProvider) => void
  oauthBusy: OAuthProvider | null
  onBackToGuest: () => void
  loggingIn: boolean
  error?: string
}) {
  const [password, setPassword] = useState('')
  const canSubmit = /.+@.+\..+/.test(email) && password.length > 0
  const busy = !!oauthBusy || loggingIn

  return (
    <div class="vz-fade-in">
      <StepHeader title="Zaloguj się" />
      <p class="vz-lead">{prefillReason || 'Zaloguj się kontem Vizyto - pominiesz weryfikację SMS.'}</p>

      <div class="vz-oauth-list">
        {PROVIDERS.map((p) => (
          <button class="vz-oauth" disabled={busy} onClick={() => onOAuth(p.id)} type="button">
            {oauthBusy === p.id ? <Spinner /> : <p.Icon size={18} />}
            Kontynuuj z {p.label}
          </button>
        ))}
      </div>

      <div class="vz-or">lub e-mailem</div>

      <div class="vz-fields">
        <Field label="E-mail" value={email} onInput={onChangeEmail} type="email" inputMode="email" autoComplete="email" full />
        <Field
          label="Hasło"
          value={password}
          onInput={setPassword}
          type="password"
          autoComplete="current-password"
          enterKeyHint="go"
          full
        />
      </div>

      {error && <div class="vz-err" role="alert">{error}</div>}

      <Button onClick={() => canSubmit && onSubmit(email, password)} disabled={!canSubmit || busy} loading={loggingIn}>
        {loggingIn ? 'Loguję…' : 'Zaloguj i rezerwuj'}
      </Button>
      <button class="vz-link" onClick={onBackToGuest} type="button" style="display:block;margin:14px auto 0;">
        Wolę zarezerwować jako gość
      </button>
    </div>
  )
}
