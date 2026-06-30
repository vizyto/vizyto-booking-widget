import { useState } from 'preact/hooks'
import { isLikelyPhone } from '../data/countries'
import { StepHeader } from '../ui/StepHeader'
import { SummaryCard, type SummaryRow } from '../ui/SummaryCard'
import { Field } from '../ui/Field'
import { PhoneField } from '../ui/PhoneField'
import { Button } from '../ui/Button'
import { Turnstile } from '../ui/Turnstile'
import { Shield, Check, ChevronRight, Mail, VizytoLogo } from '../ui/icons'

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
    if (!isLikelyPhone(contact.phone)) next.phone = 'Niepoprawny numer'
    if (contact.email.trim() && !emailOk(contact.email)) next.email = 'Niepoprawny e-mail'
    setErrs(next)
    if (Object.keys(next).length) return
    onSendCode(contact.phone)
  }

  return (
    <div class="vz-fade-in">
      <StepHeader title="Twoje dane" />
      <SummaryCard rows={summary} />

      {!emailExists && (
        <div class="vz-vizyto-card">
          <div class="vz-vizyto-brand"><VizytoLogo height={16} /></div>
          <div class="vz-vizyto-title">Rezerwuj szybciej z kontem Vizyto</div>
          <ul class="vz-vizyto-perks">
            <li><span class="vz-vizyto-tick"><Check size={12} /></span> Bez kodu SMS - rezerwujesz od razu</li>
            <li><span class="vz-vizyto-tick"><Check size={12} /></span> Twoje dane uzupełnią się automatycznie</li>
            <li><span class="vz-vizyto-tick"><Check size={12} /></span> Historia wizyt i przypomnienia w jednym miejscu</li>
          </ul>
          <button class="vz-vizyto-cta" onClick={onGoLogin} type="button">
            Zaloguj się przez Vizyto <ChevronRight size={15} />
          </button>
        </div>
      )}

      <div class="vz-fields">
        <Field label="Imię" value={contact.firstName} onInput={(v) => set('firstName', v)} autoComplete="given-name" error={errs.firstName} />
        <Field label="Nazwisko" value={contact.lastName} onInput={(v) => set('lastName', v)} autoComplete="family-name" error={errs.lastName} />
        <PhoneField
          label="Telefon"
          value={contact.phone}
          onChange={(v) => set('phone', v)}
          error={errs.phone}
        />
        <Field
          label="E-mail (opcjonalnie)"
          value={contact.email}
          onInput={(v) => set('email', v)}
          onBlur={onCheckEmail}
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="adres@email.com"
          icon={<Mail size={17} />}
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
    </div>
  )
}
