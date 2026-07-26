import { useState } from 'preact/hooks'
import type { BookingPolicy } from '../api'
import { isLikelyPhone } from '../data/countries'
import { StepHeader } from '../ui/StepHeader'
import { Notice } from '../ui/Notice'
import { SummaryCard, type SummaryRow } from '../ui/SummaryCard'
import { Field } from '../ui/Field'
import { PhoneField } from '../ui/PhoneField'
import { Button } from '../ui/Button'
import { Turnstile } from '../ui/Turnstile'
import { Shield, Check, ChevronRight, Mail, VizytoLogo } from '../ui/icons'

export type Contact = { firstName: string; lastName: string; phone: string; email: string }

const emailOk = (e: string) => /.+@.+\..+/.test(e)

/**
 * The cancellation window, said in one sentence the customer can act on.
 *
 * Word-for-word port of formatCancellationPolicy from
 * packages/shared/src/utils/booking-provider.ts: the same business, read on the
 * widget and in the app, must promise the same thing. The earlier wording here
 * also said "bezpłatne", which the business never configured.
 */
function cancellationText(p: BookingPolicy): string {
  if (!p.allowCancellation) {
    return 'Rezerwacji nie można odwołać online. Skontaktuj się z nami, jeśli coś się zmieni.'
  }
  const hours = p.cancellationHoursBefore
  if (!hours || hours <= 0) return 'Rezerwację możesz odwołać do początku wizyty.'
  if (hours % 24 === 0) {
    const days = hours / 24
    return `Rezerwację możesz odwołać najpóźniej ${days} ${days === 1 ? 'dzień' : 'dni'} przed wizytą.`
  }
  const rest = hours % 10
  const teens = hours % 100
  const noun = hours === 1 ? 'godzinę'
    : (rest >= 2 && rest <= 4 && !(teens >= 12 && teens <= 14)) ? 'godziny'
      : 'godzin'
  return `Rezerwację możesz odwołać najpóźniej ${hours} ${noun} przed wizytą.`
}

export function StepIdentify({
  summary,
  contact,
  onChange,
  notes,
  onNotes,
  emailExists,
  onCheckEmail,
  onSendCode,
  onGoLogin,
  sending,
  error,
  policy,
  turnstileKey,
  turnstileToken,
  onTurnstile,
}: {
  summary: SummaryRow[]
  contact: Contact
  onChange: (c: Contact) => void
  // Optional appointment note ("Notatki") - only rendered when onNotes is passed.
  notes?: string
  onNotes?: (v: string) => void
  /** Booking terms to read before confirming; omitted when there is nothing to confirm. */
  policy?: BookingPolicy
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
      {/* No rows = access-check login before any slot is chosen - skip the card. */}
      {summary.length > 0 && <SummaryCard rows={summary} />}

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

      {onNotes && (
        <label class="vz-notes">
          <span class="vz-notes-label">Notatki (opcjonalnie)</span>
          <textarea
            class="vz-textarea"
            rows={3}
            value={notes ?? ''}
            onInput={(e) => onNotes((e.target as HTMLTextAreaElement).value)}
            placeholder="Dodatkowe informacje dla specjalisty"
          />
        </label>
      )}

      {/* Terms right above the button that books - the last thing read before
          the reservation is made, not something to hunt for afterwards. */}
      {policy && (
        <div class="vz-terms">
          <Notice title="Warunki odwoływania rezerwacji" tone="plain">{cancellationText(policy)}</Notice>
          {policy.importantInfo.trim() && (
            <Notice title="Ważne informacje" tone="plain">
              <span class="vz-notice-pre">{policy.importantInfo.trim()}</span>
            </Notice>
          )}
        </div>
      )}

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
