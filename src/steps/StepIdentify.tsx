import { useState } from 'preact/hooks'
import { normalizePlPhone } from '../api'
import { StepHeader } from '../ui/StepHeader'
import { SummaryCard, type SummaryRow } from '../ui/SummaryCard'
import { Field } from '../ui/Field'
import { Button } from '../ui/Button'
import { Turnstile } from '../ui/Turnstile'
import { Shield } from '../ui/icons'

export type Contact = { firstName: string; lastName: string; phone: string; email: string }

const emailOk = (e: string) => /.+@.+\..+/.test(e)

export function StepIdentify({
  summary,
  contact,
  onChange,
  emailExists,
  onCheckEmail,
  onSendCode,
  onGoLogin,
  sending,
  error,
  turnstileKey,
  turnstileToken,
  onTurnstile,
}: {
  summary: SummaryRow[]
  contact: Contact
  onChange: (c: Contact) => void
  emailExists: boolean
  onCheckEmail: () => void
  onSendCode: (normalizedPhone: string) => void
  onGoLogin: () => void
  sending: boolean
  error?: string
  turnstileKey?: string
  turnstileToken: string | null
  onTurnstile: (token: string | null) => void
}) {
  const [errs, setErrs] = useState<Partial<Record<keyof Contact, string>>>({})
  const set = (k: keyof Contact, v: string) => {
    onChange({ ...contact, [k]: v })
    if (errs[k]) setErrs((p) => ({ ...p, [k]: undefined }))
  }

  function submit() {
    const next: typeof errs = {}
    if (!contact.firstName.trim()) next.firstName = 'Podaj imię'
    if (!contact.lastName.trim()) next.lastName = 'Podaj nazwisko'
    const phone = normalizePlPhone(contact.phone)
    if (!phone) next.phone = 'Niepoprawny numer'
    if (!emailOk(contact.email)) next.email = 'Niepoprawny e-mail'
    setErrs(next)
    if (Object.keys(next).length) return
    onSendCode(phone!)
  }

  return (
    <div class="vz-fade-in">
      <StepHeader title="Twoje dane" />
      <SummaryCard rows={summary} />

      <div class="vz-fields">
        <Field label="Imię" value={contact.firstName} onInput={(v) => set('firstName', v)} autoComplete="given-name" error={errs.firstName} />
        <Field label="Nazwisko" value={contact.lastName} onInput={(v) => set('lastName', v)} autoComplete="family-name" error={errs.lastName} />
        <Field
          label="Telefon"
          value={contact.phone}
          onInput={(v) => set('phone', v)}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+48 600 700 800"
          error={errs.phone}
          full
        />
        <Field
          label="E-mail"
          value={contact.email}
          onInput={(v) => set('email', v)}
          onBlur={onCheckEmail}
          type="email"
          inputMode="email"
          autoComplete="email"
          error={errs.email}
          full
        />
      </div>

      {error && <div class="vz-err" role="alert">{error}</div>}

      {emailExists ? (
        <>
          <div class="vz-note" style="margin-top:14px;">Ten e-mail ma już konto Vizyto. Zaloguj się, aby dokończyć rezerwację.</div>
          <Button onClick={onGoLogin}>Zaloguj się przez Vizyto</Button>
        </>
      ) : (
        <>
          {turnstileKey && (
            <div class="vz-turnstile-wrap" style="display:flex;justify-content:center;margin-top:14px;">
              <Turnstile siteKey={turnstileKey} onToken={onTurnstile} />
            </div>
          )}
          <Button onClick={submit} loading={sending} disabled={!!turnstileKey && !turnstileToken}>
            {sending ? 'Wysyłam kod…' : 'Wyślij kod SMS'}
          </Button>
        </>
      )}

      <div class="vz-hint" style="display:flex;align-items:center;justify-content:center;gap:6px;">
        <Shield size={13} /> Potwierdzamy numer kodem SMS, by chronić terminy.
      </div>

      {!emailExists && (
        <>
          <div class="vz-or">lub</div>
          <button class="vz-link" onClick={onGoLogin} type="button" style="display:block;margin:0 auto;">
            Masz konto Vizyto? Zaloguj się
          </button>
        </>
      )}
    </div>
  )
}
