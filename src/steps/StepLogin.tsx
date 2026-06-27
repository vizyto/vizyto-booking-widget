import { useState } from 'preact/hooks'
import { StepHeader } from '../ui/StepHeader'
import { Field } from '../ui/Field'
import { Button } from '../ui/Button'

export function StepLogin({
  email,
  prefillReason,
  onChangeEmail,
  onSubmit,
  onBackToGuest,
  loggingIn,
  error,
}: {
  email: string
  prefillReason?: string
  onChangeEmail: (v: string) => void
  onSubmit: (email: string, password: string) => void
  onBackToGuest: () => void
  loggingIn: boolean
  error?: string
}) {
  const [password, setPassword] = useState('')
  const canSubmit = /.+@.+\..+/.test(email) && password.length > 0

  return (
    <div class="vz-fade-in">
      <StepHeader title="Zaloguj się" />
      <p class="vz-lead">{prefillReason || 'Zaloguj się kontem Vizyto — pominiesz weryfikację SMS.'}</p>

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

      <Button onClick={() => canSubmit && onSubmit(email, password)} disabled={!canSubmit} loading={loggingIn}>
        {loggingIn ? 'Loguję…' : 'Zaloguj i rezerwuj'}
      </Button>
      <button class="vz-link" onClick={onBackToGuest} type="button" style="display:block;margin:14px auto 0;">
        Wolę zarezerwować jako gość
      </button>
    </div>
  )
}
