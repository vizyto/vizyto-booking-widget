import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { Business, Cfg, DayCounts, OAuthProvider, Resource, Service, Slots } from './api'
import {
  checkEmail,
  createAppointment,
  formatDuration,
  formatPrice2,
  getAvailability,
  getCounts,
  loginEmail,
  maskPhone,
  oauthLogin,
  sendGuestOtp,
  slotLabel,
  slotStartDate,
  verifyGuestOtp,
} from './api'
import { dayMonth, nextDays } from './dates'
import { noopEmit, type EmitFn } from './events'
import { ProgressBar } from './ui/ProgressBar'
import { Spinner } from './ui/Spinner'
import { Powered } from './ui/Powered'
import { ArrowLeft, ArrowRight, Close } from './ui/icons'
import type { SummaryRow } from './ui/SummaryCard'
import { StepService } from './steps/StepService'
import { StepResource } from './steps/StepResource'
import { StepDateTime } from './steps/StepDateTime'
import { StepIdentify, type Contact } from './steps/StepIdentify'
import { StepLogin } from './steps/StepLogin'
import { StepOtp } from './steps/StepOtp'
import { StepDone } from './steps/StepDone'

const HORIZON = 42
const OTP_RESEND_MS = 60_000

type ResChoice = number | 'any'
type Phase = 'select' | 'identify' | 'login' | 'otp' | 'confirming' | 'done' | 'slotLost'
export type Auth = { userId: number; token: string | null }

const emptyContact: Contact = { firstName: '', lastName: '', phone: '', email: '' }

export type Prefill = { serviceId?: number; resourceId?: number }

export function BookingFlow({
  cfg,
  business,
  prefill,
  preAuth,
  onClose,
  emit = noopEmit,
}: {
  cfg: Cfg
  business: Business
  prefill?: Prefill
  preAuth?: Auth
  onClose?: () => void
  emit?: EmitFn
}) {
  const services = useMemo(() => business.services.filter((s) => s.bookingType !== 'group'), [business])
  const workers = useMemo(() => business.resources.filter((r) => r.type === 'worker'), [business])

  // With 0-1 specialists there's no specialist choice: the step is skipped and
  // the progress is a 3-step flow. "od" (from) pricing also only applies when a
  // service's price can vary between specialists, i.e. there are several.
  const hasResourceStep = workers.length > 1
  const stepNames = hasResourceStep
    ? ['WYBÓR USŁUGI', 'WYBÓR SPECJALISTY', 'WYBÓR TERMINU', 'TWOJE DANE']
    : ['WYBÓR USŁUGI', 'WYBÓR TERMINU', 'TWOJE DANE']
  const totalSteps = stepNames.length

  // Seed selection from prefill (e.g. a tapped service or barber CTA).
  const initialService = useMemo(() => services.find((s) => s.id === prefill?.serviceId) ?? null, [services, prefill?.serviceId])
  const initialResource = useMemo<ResChoice | null>(() => {
    if (prefill?.resourceId && workers.some((w) => w.id === prefill.resourceId)) return prefill.resourceId
    if (initialService && workers.length === 0) return 'any'
    if (initialService && workers.length === 1) return workers[0].id
    return null
  }, [workers, prefill?.resourceId, initialService])

  // selection
  const [service, setService] = useState<Service | null>(initialService)
  const [resource, setResource] = useState<ResChoice | null>(initialResource)
  const [date, setDate] = useState('')
  const [slotKey, setSlotKey] = useState('')
  const [counts, setCounts] = useState<DayCounts>({})
  const [slots, setSlots] = useState<Slots>({})
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [refetch, setRefetch] = useState(0)
  // 0 service, 1 specialist, 2 termin - skip ahead when prefilled.
  const [selStep, setSelStep] = useState(initialService && initialResource != null ? 2 : initialService ? 1 : 0)

  // flow
  const [phase, setPhase] = useState<Phase>('select')
  const [contact, setContact] = useState<Contact>(emptyContact)
  const [emailExists, setEmailExists] = useState(false)
  const [auth, setAuth] = useState<Auth | null>(preAuth ?? null)

  // otp
  const [code, setCode] = useState('')
  // Cloudflare Turnstile token (anti-toll-fraud on the SMS path). Single-use:
  // captured from the visible widget, consumed by a send, then cleared so the
  // next send re-gates. Only enforced when cfg.turnstileKey is configured.
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [otpInfo, setOtpInfo] = useState({ maskedPhone: '', expiresAt: 0, resendAt: 0 })
  const [attemptsLeft, setAttemptsLeft] = useState(3)
  const [now, setNow] = useState(() => Date.now())

  // busy + errors
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)
  const [oauthBusy, setOauthBusy] = useState<OAuthProvider | null>(null)
  const [identifyErr, setIdentifyErr] = useState('')
  const [otpErr, setOtpErr] = useState('')
  const [loginErr, setLoginErr] = useState('')
  const [loginReason, setLoginReason] = useState('')
  const [bookingErr, setBookingErr] = useState('')
  const booking = useRef(false)
  const bodyRef = useRef<HTMLDivElement>(null)

  const resourceId = resource === 'any' || resource == null ? undefined : resource
  const days = useMemo(() => nextDays(HORIZON), [])
  const worker: Resource | undefined = typeof resource === 'number' ? workers.find((w) => w.id === resource) : undefined
  const workerName = resource === 'any' || resource == null ? 'Dowolny specjalista' : worker?.name ?? ''

  useEffect(() => {
    if (!service) return
    let cancelled = false
    getCounts(cfg, { startDate: days[0], endDate: days[days.length - 1], businessServiceId: service.id, resourceId }).then(
      (x) => !cancelled && setCounts(x),
    )
    return () => {
      cancelled = true
    }
  }, [service?.id, resourceId, refetch])

  useEffect(() => {
    if (!service || !date) {
      setSlots({})
      return
    }
    let cancelled = false
    setLoadingSlots(true)
    getAvailability(cfg, { date, businessServiceId: service.id, resourceId })
      .then((x) => !cancelled && setSlots(x))
      .finally(() => !cancelled && setLoadingSlots(false))
    return () => {
      cancelled = true
    }
  }, [service?.id, resourceId, date, refetch])

  useEffect(() => {
    if (phase !== 'otp') return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [phase])

  // Scroll each step back to the top so long lists don't start mid-way.
  useEffect(() => {
    bodyRef.current?.scrollTo(0, 0)
  }, [phase, selStep])

  const summaryRows: SummaryRow[] = service
    ? [
        { label: 'Usługa', value: service.name },
        { label: 'Specjalista', value: workerName },
        { label: 'Termin', value: `${dayMonth(date)}, ${slotLabel(date, slotKey, business.timezone)}` },
        { label: 'Cena', value: formatPrice2(service.price), total: true },
      ]
    : []

  async function book(a: Auth, key = slotKey) {
    if (!service || !date || !key || booking.current) return
    booking.current = true
    setBookingErr('')
    setPhase('confirming')
    const ctx = bookingCtx(key)
    emit('booking_submitted', { ...ctx, userId: a.userId })
    const r = await createAppointment(
      cfg,
      { businessServiceId: service.id, startDate: slotStartDate(date, key), bookedById: a.userId, resourceId },
      a.token,
    )
    booking.current = false
    if (r.ok) {
      setPhase('done')
      emit('booking_completed', {
        ...ctx,
        userId: a.userId,
        appointmentId: r.data?.id ?? null,
        // GA4-ecommerce convenience: value in major units (PLN), price is grosze.
        value: service.price / 100,
        currency: 'PLN',
      })
      return
    }
    if (r.code === 'BOOKED_BY_MISMATCH' || r.code === 'VERIFICATION_REQUIRED') {
      setAuth(null)
      setIdentifyErr('Potwierdź numer telefonu, aby dokończyć rezerwację.')
      setPhase('identify')
      emit('booking_failed', { ...ctx, code: r.code, reason: 'verification_required' })
      return
    }
    if (r.code === 'NETWORK') {
      setBookingErr('Brak połączenia. Spróbuj ponownie.')
      emit('booking_failed', { ...ctx, code: r.code, reason: 'network' })
      return
    }
    setSlotKey('')
    setPhase('slotLost')
    emit('slot_lost', { ...ctx, code: r.code })
    emit('booking_failed', { ...ctx, code: r.code, reason: 'slot_lost' })
  }

  // Resolve a specialist choice to a stable {id,name} shape for event payloads.
  const resourceEvent = (r: ResChoice) =>
    r === 'any' ? { resourceId: null, resourceName: 'Dowolny specjalista' } : { resourceId: r, resourceName: workers.find((w) => w.id === r)?.name ?? '' }

  // The full booking context shared by every funnel event past slot selection.
  const bookingCtx = (key = slotKey) => ({
    serviceId: service?.id,
    serviceName: service?.name,
    price: service?.price,
    ...resourceEvent(resource ?? 'any'),
    date,
    time: key ? slotLabel(date, key, business.timezone) : '',
    startDate: key ? slotStartDate(date, key) : '',
  })

  // ---- selection (select-then-Dalej) ----
  function pickService(s: Service) {
    if (s.id !== service?.id) {
      setService(s)
      // keep any preselected specialist (worker list is business-wide); just
      // clear the chosen day/slot since availability is per service.
      setDate('')
      setSlotKey('')
      emit('service_selected', { serviceId: s.id, serviceName: s.name, price: s.price, durationMin: s.duration })
    }
  }
  function pickResource(r: ResChoice) {
    if (r !== resource) {
      setResource(r)
      setDate('')
      setSlotKey('')
      emit('specialist_selected', resourceEvent(r))
    }
  }
  function dalej() {
    if (selStep === 0) {
      if (!service) return
      if (workers.length <= 1) {
        const r: ResChoice = workers.length === 1 ? workers[0].id : 'any'
        setResource(r)
        setSelStep(2)
        emit('specialist_selected', { ...resourceEvent(r), auto: true })
      } else setSelStep(1)
    } else if (selStep === 1) {
      if (resource == null) return
      setSelStep(2)
    } else {
      if (!slotKey) return
      if (auth) void book(auth, slotKey)
      else {
        emit('details_started', bookingCtx(slotKey))
        setPhase('identify')
      }
    }
  }

  // ---- back (rendered in the panel header) ----
  const backFn: (() => void) | null = (() => {
    if (phase === 'identify') return () => setPhase('select')
    if (phase === 'login') return () => { setLoginErr(''); setPhase('identify') }
    if (phase === 'otp') return () => { setOtpErr(''); setPhase('identify') }
    if (phase === 'slotLost') return () => recoverSlot()
    if (phase === 'select') {
      if (selStep === 2) return () => setSelStep(workers.length > 1 ? 1 : 0)
      if (selStep === 1) return () => setSelStep(0)
      return onClose ?? null // first step: back closes (launcher)
    }
    return null // confirming / done
  })()

  // ---- identify / otp / login ----
  function onContactChange(c: Contact) {
    if (c.email !== contact.email) setEmailExists(false)
    setContact(c)
  }
  async function onCheckEmail() {
    if (!/.+@.+\..+/.test(contact.email)) return
    const r = await checkEmail(cfg, contact.email.trim().toLowerCase())
    if (!('error' in r)) setEmailExists(r.exists)
  }
  async function onSendCode(phone: string) {
    setContact((c) => ({ ...c, phone }))
    setSending(true)
    setIdentifyErr('')
    const r = await sendGuestOtp(cfg, { phone, turnstileToken })
    setSending(false)
    setTurnstileToken(null) // token is single-use - force a fresh solve next time
    if (!r.ok) {
      setIdentifyErr(
        r.code === 'RATE_LIMITED'
          ? `Poczekaj ${r.retryAfter ?? 60}s i spróbuj ponownie.`
          : r.code === 'CAPTCHA_REQUIRED'
            ? 'Potwierdź, że nie jesteś robotem, i spróbuj ponownie.'
            : r.code === 'SITE_KEY_REQUIRED'
              ? 'Rezerwacja jest chwilowo niedostępna.'
              : 'Nie udało się wysłać kodu. Spróbuj ponownie.',
      )
      return
    }
    setCode('')
    setAttemptsLeft(3)
    setOtpErr('')
    const maskedPhone = r.maskedPhone || maskPhone(phone)
    setOtpInfo({
      maskedPhone,
      expiresAt: Date.now() + r.expiresIn * 1000,
      resendAt: Date.now() + OTP_RESEND_MS,
    })
    setPhase('otp')
    emit('otp_sent', { maskedPhone, resend: false })
  }
  async function onResend() {
    setSending(true)
    setOtpErr('')
    const r = await sendGuestOtp(cfg, { phone: contact.phone, turnstileToken })
    setSending(false)
    setTurnstileToken(null)
    if (!r.ok) {
      setOtpErr(
        r.code === 'RATE_LIMITED'
          ? `Poczekaj ${r.retryAfter ?? 60}s.`
          : r.code === 'CAPTCHA_REQUIRED'
            ? 'Potwierdź, że nie jesteś robotem.'
            : 'Nie udało się wysłać kodu.',
      )
      return
    }
    setCode('')
    setAttemptsLeft(3)
    const maskedPhone = r.maskedPhone || maskPhone(contact.phone)
    setOtpInfo({
      maskedPhone,
      expiresAt: Date.now() + r.expiresIn * 1000,
      resendAt: Date.now() + OTP_RESEND_MS,
    })
    emit('otp_sent', { maskedPhone, resend: true })
  }
  async function onVerify(c: string) {
    if (verifying) return
    setVerifying(true)
    setOtpErr('')
    const r = await verifyGuestOtp(cfg, {
      firstName: contact.firstName.trim(),
      lastName: contact.lastName.trim(),
      email: contact.email.trim().toLowerCase(),
      phone: contact.phone,
      otp: c,
    })
    setVerifying(false)
    if (r.ok) {
      const a = { userId: r.data.userId, token: r.data.token }
      setAuth(a)
      emit('otp_verified', { userId: a.userId })
      emit('authenticated', { method: 'otp', userId: a.userId })
      void book(a)
      return
    }
    if (r.code === 'EMAIL_IN_USE') {
      setLoginReason('Ten e-mail ma już konto Vizyto. Zaloguj się, aby dokończyć rezerwację.')
      setPhase('login')
      return
    }
    if (r.code === 'EXPIRED') {
      setOtpErr('Kod wygasł. Wyślij nowy.')
      return
    }
    const left = r.remainingAttempts ?? attemptsLeft - 1
    setAttemptsLeft(left)
    setCode('')
    if (left <= 0) {
      setIdentifyErr('Zbyt wiele prób. Wyślij nowy kod.')
      setPhase('identify')
      return
    }
    setOtpErr(`Nieprawidłowy kod. Pozostało prób: ${left}`)
  }
  async function onLogin(email: string, password: string) {
    if (loggingIn) return
    setLoggingIn(true)
    setLoginErr('')
    const r = await loginEmail(cfg, { email: email.trim().toLowerCase(), password })
    setLoggingIn(false)
    if (!r.ok) {
      setLoginErr(r.code === 'SITE_KEY_REQUIRED' ? 'Rezerwacja jest chwilowo niedostępna.' : 'Nieprawidłowy e-mail lub hasło.')
      return
    }
    const a = { userId: r.data.userId, token: r.data.token }
    setAuth(a)
    emit('authenticated', { method: 'password', userId: a.userId })
    void book(a)
  }
  async function onOAuth(provider: OAuthProvider) {
    if (oauthBusy || loggingIn) return
    setOauthBusy(provider)
    setLoginErr('')
    const r = await oauthLogin(cfg, provider)
    setOauthBusy(null)
    if (!r.ok) {
      if (r.code === 'POPUP_CLOSED') return // user closed the popup - no error
      setLoginErr(
        r.code === 'POPUP_BLOCKED'
          ? 'Zezwól na wyskakujące okienka, aby zalogować się tą metodą.'
          : 'Logowanie nie powiodło się. Spróbuj ponownie.',
      )
      return
    }
    const a = { userId: r.data.userId, token: r.data.token }
    setAuth(a)
    emit('authenticated', { method: provider, userId: a.userId })
    void book(a)
  }
  function goLogin() {
    setLoginReason('')
    setLoginErr('')
    setPhase('login')
  }
  function recoverSlot() {
    setSlotKey('')
    setSlots({})
    setBookingErr('')
    setRefetch((x) => x + 1)
    setSelStep(2)
    setPhase('select')
  }
  function restart() {
    setService(null)
    setResource(null)
    setDate('')
    setSlotKey('')
    setSelStep(0)
    setContact(emptyContact)
    setEmailExists(false)
    setAuth(preAuth ?? null)
    setCode('')
    setAttemptsLeft(3)
    setOtpInfo({ maskedPhone: '', expiresAt: 0, resendAt: 0 })
    setSending(false)
    setVerifying(false)
    setLoggingIn(false)
    setOauthBusy(null)
    booking.current = false
    setIdentifyErr('')
    setOtpErr('')
    setLoginErr('')
    setBookingErr('')
    setPhase('select')
  }

  // Map internal selStep (0 service, 1 specialist, 2 termin) onto the visible
  // step index, collapsing the specialist step when it doesn't exist.
  const termIdx = hasResourceStep ? 2 : 1
  const progStep =
    phase === 'select'
      ? selStep === 0
        ? 0
        : selStep === 1
          ? 1
          : termIdx
      : phase === 'slotLost'
        ? termIdx
        : totalSteps - 1
  const showCta = phase === 'select'
  const canAdvance = selStep === 0 ? !!service : selStep === 1 ? resource != null : !!slotKey
  const ctaPrice = service ? `${selStep === 0 && hasResourceStep ? 'od ' : ''}${formatPrice2(service.price)}` : ''

  return (
    <div class="vz-panel" role="dialog" aria-modal={onClose ? 'true' : undefined} aria-label="Zarezerwuj wizytę">
      {onClose && <span class="vz-grab" aria-hidden="true" />}
      <header class="vz-head">
        {backFn ? (
          <button class="vz-iconbtn" onClick={backFn} aria-label="Wstecz" type="button"><ArrowLeft size={20} /></button>
        ) : (
          <span class="vz-head-spacer" />
        )}
        <div class="vz-title">Zarezerwuj wizytę</div>
        {onClose ? (
          <button class="vz-iconbtn" onClick={onClose} aria-label="Zamknij" type="button"><Close size={20} /></button>
        ) : (
          <span class="vz-head-spacer" />
        )}
      </header>

      <div class="vz-body" ref={bodyRef} tabIndex={-1}>
        {phase !== 'done' && <ProgressBar step={progStep} total={totalSteps} label={stepNames[progStep]} />}

        {phase === 'select' && selStep === 0 && (
          <StepService services={services} selectedId={service?.id} onPick={pickService} priceFrom={hasResourceStep} />
        )}
        {phase === 'select' && selStep === 1 && service && (
          <StepResource workers={workers} service={service} selected={resource} onPick={pickResource} />
        )}
        {phase === 'select' && selStep === 2 && service && (
          <StepDateTime
            days={days}
            counts={counts}
            date={date}
            slots={slots}
            loading={loadingSlots}
            timezone={business.timezone}
            selectedSlot={slotKey}
            onPickDate={(d) => { setDate(d); setSlotKey('') }}
            onPickSlot={(key) => {
              setSlotKey(key)
              emit('datetime_selected', { ...bookingCtx(key), slotKey: key })
            }}
          />
        )}

        {phase === 'identify' && service && (
          <StepIdentify
            summary={summaryRows}
            contact={contact}
            onChange={onContactChange}
            emailExists={emailExists}
            onCheckEmail={onCheckEmail}
            onSendCode={onSendCode}
            onGoLogin={goLogin}
            sending={sending}
            error={identifyErr}
            turnstileKey={cfg.turnstileKey}
            turnstileToken={turnstileToken}
            onTurnstile={setTurnstileToken}
          />
        )}
        {phase === 'login' && (
          <StepLogin
            email={contact.email}
            prefillReason={loginReason}
            onChangeEmail={(v) => onContactChange({ ...contact, email: v })}
            onSubmit={onLogin}
            onOAuth={onOAuth}
            oauthBusy={oauthBusy}
            onBackToGuest={() => { setLoginErr(''); setPhase('identify') }}
            loggingIn={loggingIn}
            error={loginErr}
          />
        )}
        {phase === 'otp' && (
          <StepOtp
            maskedPhone={otpInfo.maskedPhone}
            code={code}
            onCode={setCode}
            onComplete={onVerify}
            onResend={onResend}
            verifying={verifying}
            resending={sending}
            error={otpErr}
            now={now}
            expiresAt={otpInfo.expiresAt}
            resendAt={otpInfo.resendAt}
            turnstileKey={cfg.turnstileKey}
            turnstileToken={turnstileToken}
            onTurnstile={setTurnstileToken}
          />
        )}
        {phase === 'confirming' &&
          (bookingErr ? (
            <div class="vz-fade-in">
              <div class="vz-err" role="alert">{bookingErr}</div>
              <button class="vz-btn mt" onClick={() => auth && book(auth)} type="button">Spróbuj ponownie</button>
            </div>
          ) : (
            <div class="vz-center" style="flex-direction:column;gap:14px;"><Spinner /> Rezerwuję Twoją wizytę…</div>
          ))}
        {phase === 'slotLost' && (
          <div class="vz-fade-in" style="text-align:center;padding:8px 0;">
            <div class="vz-done-title" style="font-size:18px;">Ten termin właśnie zniknął</div>
            <p class="vz-lead" style="margin-top:8px;">Ktoś był szybszy. Wybierz inny wolny termin - Twoje dane zostają zapisane.</p>
            <button class="vz-btn mt" onClick={recoverSlot} type="button">Wybierz inny termin</button>
          </div>
        )}
        {phase === 'done' && (
          <StepDone rows={summaryRows} phone={contact.phone} email={contact.email} onClose={onClose} onRestart={restart} />
        )}
      </div>

      {showCta && (
        <div class="vz-cta">
          <div class="vz-cta-summary">
            <div class="vz-cta-left">
              {service ? (
                <>
                  <div class="vz-cta-svc">{service.name}</div>
                  <div class="vz-cta-meta"><b>{ctaPrice}</b> · {formatDuration(service.duration)}</div>
                </>
              ) : (
                <div class="vz-cta-meta">Wybierz usługę, aby kontynuować</div>
              )}
            </div>
            {selStep >= 1 && resource != null && (
              <div class="vz-cta-who">
                <span class="vz-card-av">{worker?.image ? <img src={worker.image} alt="" /> : worker ? worker.name.charAt(0) : '✦'}</span>
                <span>{resource === 'any' ? 'Dowolny' : worker?.name}</span>
              </div>
            )}
          </div>
          <button class="vz-btn" onClick={dalej} disabled={!canAdvance} type="button">
            Dalej <ArrowRight size={18} />
          </button>
        </div>
      )}

      <Powered />
    </div>
  )
}
