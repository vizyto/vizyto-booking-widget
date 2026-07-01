import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { Business, Cfg, DayCounts, OAuthProvider, Resource, Service, ServiceCategory, Slots } from './api'
import {
  checkEmail,
  createAppointment,
  effectiveForWorker,
  formatDuration,
  formatPrice2,
  getAvailability,
  getCounts,
  getServiceCategories,
  joinWaitlist,
  loginEmail,
  maskPhone,
  oauthLogin,
  priceRange,
  sendGuestOtp,
  slotLabel,
  slotStartDate,
  verifyGuestOtp,
  workerOffersService,
} from './api'
import { dayMonth, nextDays } from './dates'
import { noopEmit, type EmitFn } from './events'
import { ProgressBar } from './ui/ProgressBar'
import { Spinner } from './ui/Spinner'
import { Powered } from './ui/Powered'
import { ArrowLeft, ArrowRight, Close } from './ui/icons'
import { SummaryCard, type SummaryRow } from './ui/SummaryCard'
import { Button } from './ui/Button'
import { StepService } from './steps/StepService'
import { StepResource } from './steps/StepResource'
import { StepDateTime } from './steps/StepDateTime'
import { StepIdentify, type Contact } from './steps/StepIdentify'
import { StepWaitlist, type WaitlistPrefs } from './steps/StepWaitlist'
import { StepLogin } from './steps/StepLogin'
import { StepOtp } from './steps/StepOtp'
import { StepDone } from './steps/StepDone'
import { Notice } from './ui/Notice'
import { Bell } from './ui/icons'

const HORIZON = 42
const OTP_RESEND_MS = 60_000

// Add whole days to a YYYY-MM-DD string in UTC (DST-safe).
const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

type ResChoice = number | 'any'
type Phase = 'select' | 'identify' | 'login' | 'otp' | 'confirming' | 'done' | 'slotLost' | 'waitlist' | 'waitlistDone'
// Whether the identify/auth path finishes by booking a slot or joining a waitlist.
type Intent = 'book' | 'waitlist'
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

  // selection (declared here because offeringWorkers below depends on the picked
  // service; the rest of the selection state follows further down).
  const initialServiceRef = useMemo(() => services.find((s) => s.id === prefill?.serviceId) ?? null, [services, prefill?.serviceId])
  const [service, setService] = useState<Service | null>(initialServiceRef)

  // A service can be offered by only a subset of workers, each possibly with an
  // overridden price/duration. Once a service is picked we work with just the
  // workers who actually offer it; before that, the whole team drives structure.
  const offeringWorkers = useMemo(
    () => (service ? workers.filter((w) => workerOffersService(service, w.id)) : workers),
    [workers, service],
  )

  // With 0-1 specialists there's no specialist choice: the step is skipped and
  // the progress is a 3-step flow. "od" (from) pricing also only applies when a
  // service's price can vary between specialists, i.e. there are several.
  const hasResourceStep = offeringWorkers.length > 1
  const stepNames = hasResourceStep
    ? ['WYBÓR USŁUGI', 'WYBÓR SPECJALISTY', 'WYBÓR TERMINU', 'TWOJE DANE']
    : ['WYBÓR USŁUGI', 'WYBÓR TERMINU', 'TWOJE DANE']
  const totalSteps = stepNames.length

  // Seed the specialist from prefill (a tapped barber CTA), or auto-pick when
  // the chosen service is offered by 0-1 of the workers who offer it.
  const initialResource = useMemo<ResChoice | null>(() => {
    if (prefill?.resourceId && offeringWorkers.some((w) => w.id === prefill.resourceId)) return prefill.resourceId
    if (service && offeringWorkers.length === 0) return 'any'
    if (service && offeringWorkers.length === 1) return offeringWorkers[0].id
    return null
  }, [offeringWorkers, prefill?.resourceId, service])

  // selection
  const [resource, setResource] = useState<ResChoice | null>(initialResource)
  const [date, setDate] = useState('')
  const [slotKey, setSlotKey] = useState('')
  const [counts, setCounts] = useState<DayCounts>({})
  const [slots, setSlots] = useState<Slots>({})
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [refetch, setRefetch] = useState(0)
  // 0 service, 1 specialist, 2 termin - skip ahead when prefilled.
  const [selStep, setSelStep] = useState(initialServiceRef && initialResource != null ? 2 : initialServiceRef ? 1 : 0)

  // flow
  const [phase, setPhase] = useState<Phase>('select')
  const [contact, setContact] = useState<Contact>(emptyContact)
  const [notes, setNotes] = useState('')
  const [emailExists, setEmailExists] = useState(false)
  const [auth, setAuth] = useState<Auth | null>(preAuth ?? null)

  // Service categories (optional grouping) fetched from a separate public endpoint.
  const [categories, setCategories] = useState<ServiceCategory[]>([])

  // The identify/auth path can end in a booking or a waitlist sign-up.
  const [intent, setIntent] = useState<Intent>('book')
  const [wlPrefs, setWlPrefs] = useState<WaitlistPrefs | null>(null)
  const [wlBusy, setWlBusy] = useState(false)
  const [wlErr, setWlErr] = useState('')

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
    let cancelled = false
    getServiceCategories(cfg).then((c) => !cancelled && setCategories(c))
    return () => {
      cancelled = true
    }
  }, [])

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

  // Effective price/duration for the current service+specialist choice, honoring
  // any per-employee override. When no specialist is fixed yet (service step or
  // "Dowolny"), fall back to the "od {min}" range across the offering workers.
  const range = service ? priceRange(service, offeringWorkers) : { min: 0, max: 0 }
  const priceVaries = range.min !== range.max
  const selEff = service && typeof resource === 'number' ? effectiveForWorker(service, resource) : null
  const shownPrice = selEff ? selEff.price : range.min
  const shownDuration = selEff ? selEff.duration : service?.duration ?? 0
  const showFrom = !selEff && priceVaries
  // Price used for analytics/booking payload: the exact override for a chosen
  // specialist, else the service base (the backend assigns the price for "Dowolny").
  const selectedPrice = selEff ? selEff.price : service?.price ?? 0

  const summaryRows: SummaryRow[] = service
    ? [
        { label: 'Usługa', value: service.name },
        { label: 'Specjalista', value: workerName },
        { label: 'Termin', value: `${dayMonth(date)}, ${slotLabel(date, slotKey, business.timezone)}` },
        { label: 'Cena', value: `${showFrom ? 'od ' : ''}${formatPrice2(shownPrice)}`, total: true },
      ]
    : []

  // Summary shown on the identify step when the intent is a waitlist sign-up
  // (no fixed time/price yet - just the service, specialist and date range).
  const waitlistSummary: SummaryRow[] = service
    ? [
        { label: 'Usługa', value: service.name },
        { label: 'Specjalista', value: workerName },
        {
          label: 'Zakres',
          value: wlPrefs ? `od ${dayMonth(date)} · ${wlPrefs.rangeDays} ${wlPrefs.rangeDays === 1 ? 'dzień' : 'dni'}` : dayMonth(date),
        },
      ]
    : []

  // Waitlist sign-up is offered when the business allows it and a service is chosen.
  const canWaitlist = business.waitlistEnabled !== false && !!service

  async function book(a: Auth, key = slotKey) {
    if (!service || !date || !key || booking.current) return
    booking.current = true
    setBookingErr('')
    setPhase('confirming')
    const ctx = bookingCtx(key)
    emit('booking_submitted', { ...ctx, userId: a.userId })
    const r = await createAppointment(
      cfg,
      { businessServiceId: service.id, startDate: slotStartDate(date, key), bookedById: a.userId, resourceId, notes: notes.trim() || undefined },
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
        value: selectedPrice / 100,
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

  // After authentication, either book the chosen slot or join the waitlist.
  function complete(a: Auth) {
    if (intent === 'waitlist') void submitWaitlist(a)
    else void book(a)
  }

  const waitlistErrorMsg = (code: string) =>
    code === 'WAITLIST_DUPLICATE'
      ? 'Już czekasz na termin tej usługi w tym zakresie dat.'
      : code === 'WAITLIST_LIMIT_REACHED'
        ? 'Masz już 3 aktywne zapisy - usuń któryś w profilu Vizyto, aby dodać nowy.'
        : code === 'WAITLIST_DISABLED'
          ? 'Ten salon nie prowadzi listy oczekujących.'
          : code === 'INCOMPLETE_PROFILE'
            ? 'Uzupełnij imię, nazwisko i telefon, aby zapisać się na listę.'
            : code === 'NETWORK'
              ? 'Brak połączenia. Spróbuj ponownie.'
              : 'Nie udało się zapisać na listę. Spróbuj ponownie.'

  async function submitWaitlist(a: Auth, prefs = wlPrefs) {
    if (!service || !date || !prefs || wlBusy) return
    setWlBusy(true)
    setWlErr('')
    const dateTo = addDays(date, prefs.rangeDays - 1)
    const r = await joinWaitlist(
      cfg,
      { businessServiceId: service.id, resourceId: resourceId ?? null, dateFrom: date, dateTo, timeFrom: prefs.timeFrom, timeTo: prefs.timeTo, bookedById: a.userId },
      a.token,
    )
    setWlBusy(false)
    if (r.ok) {
      setPhase('waitlistDone')
      emit('waitlist_joined', {
        serviceId: service.id,
        serviceName: service.name,
        ...resourceEvent(resource ?? 'any'),
        dateFrom: date,
        dateTo,
        timeFrom: prefs.timeFrom,
        timeTo: prefs.timeTo,
      })
      return
    }
    setWlErr(waitlistErrorMsg(r.code))
    setPhase('waitlist')
    emit('waitlist_failed', { code: r.code })
  }

  // Open the waitlist form for the selected service/day. The sign-up needs an
  // authenticated user, which the identify/OTP path supplies at submit time.
  function startWaitlist() {
    setIntent('waitlist')
    setWlErr('')
    emit('waitlist_started', { serviceId: service?.id, ...resourceEvent(resource ?? 'any'), date })
    setPhase('waitlist')
  }

  function onWaitlistFormSubmit(prefs: WaitlistPrefs) {
    setWlPrefs(prefs)
    if (auth) void submitWaitlist(auth, prefs)
    else {
      emit('details_started', { serviceId: service?.id, waitlist: true })
      setPhase('identify')
    }
  }

  // Resolve a specialist choice to a stable {id,name} shape for event payloads.
  const resourceEvent = (r: ResChoice) =>
    r === 'any' ? { resourceId: null, resourceName: 'Dowolny specjalista' } : { resourceId: r, resourceName: workers.find((w) => w.id === r)?.name ?? '' }

  // The full booking context shared by every funnel event past slot selection.
  const bookingCtx = (key = slotKey) => ({
    serviceId: service?.id,
    serviceName: service?.name,
    price: service ? selectedPrice : undefined,
    ...resourceEvent(resource ?? 'any'),
    date,
    time: key ? slotLabel(date, key, business.timezone) : '',
    startDate: key ? slotStartDate(date, key) : '',
  })

  // ---- selection (select-then-Dalej) ----
  function pickService(s: Service) {
    if (s.id !== service?.id) {
      setService(s)
      // Keep a preselected specialist only if they also offer the new service;
      // otherwise drop the choice so the user re-picks from the offering workers.
      if (typeof resource === 'number' && !workerOffersService(s, resource)) setResource(null)
      // Availability is per service, so the chosen day/slot no longer applies.
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
      if (offeringWorkers.length <= 1) {
        const r: ResChoice = offeringWorkers.length === 1 ? offeringWorkers[0].id : 'any'
        setResource(r)
        setSelStep(2)
        emit('specialist_selected', { ...resourceEvent(r), auto: true })
      } else setSelStep(1)
    } else if (selStep === 1) {
      if (resource == null) return
      setSelStep(2)
    } else {
      if (!slotKey) return
      setIntent('book')
      if (auth) void book(auth, slotKey)
      else {
        emit('details_started', bookingCtx(slotKey))
        setPhase('identify')
      }
    }
  }

  // ---- back (rendered in the panel header) ----
  const backFn: (() => void) | null = (() => {
    if (phase === 'identify') return () => setPhase(intent === 'waitlist' ? 'waitlist' : 'select')
    if (phase === 'waitlist') return () => { setWlErr(''); setIntent('book'); setSelStep(2); setPhase('select') }
    if (phase === 'login') return () => { setLoginErr(''); setPhase('identify') }
    if (phase === 'otp') return () => { setOtpErr(''); setPhase('identify') }
    if (phase === 'slotLost') return () => recoverSlot()
    if (phase === 'select') {
      if (selStep === 2) return () => setSelStep(hasResourceStep ? 1 : 0)
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
      complete(a)
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
    complete(a)
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
    complete(a)
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
    setNotes('')
    setIntent('book')
    setWlPrefs(null)
    setWlBusy(false)
    setWlErr('')
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
      : phase === 'slotLost' || phase === 'waitlist'
        ? termIdx
        : totalSteps - 1
  const showCta = phase === 'select'
  const canAdvance = selStep === 0 ? !!service : selStep === 1 ? resource != null : !!slotKey
  const ctaPrice = service ? `${showFrom ? 'od ' : ''}${formatPrice2(shownPrice)}` : ''

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
        {phase !== 'done' && phase !== 'waitlistDone' && (
          <ProgressBar step={progStep} total={totalSteps} label={stepNames[progStep]} />
        )}

        {business.isTestMode && (phase === 'select' || phase === 'identify' || phase === 'waitlist') && (
          <Notice title="Rezerwacja próbna">
            Ten salon dopiero uruchamia rezerwacje online. Złożona tu rezerwacja nie jest jeszcze wiążąca - potwierdź ją bezpośrednio z salonem.
          </Notice>
        )}

        {phase === 'select' && selStep === 0 && (
          <StepService services={services} workers={workers} categories={categories} selectedId={service?.id} onPick={pickService} />
        )}
        {phase === 'select' && selStep === 1 && service && (
          <StepResource workers={offeringWorkers} service={service} selected={resource} onPick={pickResource} />
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
            canWaitlist={canWaitlist}
            onJoinWaitlist={startWaitlist}
          />
        )}

        {phase === 'waitlist' && service && (
          <StepWaitlist
            serviceName={service.name}
            workerName={workerName}
            date={date}
            onSubmit={onWaitlistFormSubmit}
            busy={wlBusy}
            error={wlErr}
          />
        )}

        {phase === 'identify' && service && (
          <StepIdentify
            summary={intent === 'waitlist' ? waitlistSummary : summaryRows}
            contact={contact}
            onChange={onContactChange}
            notes={intent === 'waitlist' ? undefined : notes}
            onNotes={intent === 'waitlist' ? undefined : setNotes}
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
        {phase === 'waitlistDone' && (
          <div class="vz-done vz-fade-in">
            <div class="vz-check"><Bell size={28} /></div>
            <div class="vz-done-title">Jesteś na liście!</div>
            <div class="vz-done-sub">
              Damy Ci znać SMS-em{contact.email ? ' i e-mailem' : ''}, gdy tylko zwolni się pasujący termin usługi <b style="color:var(--vz-text)">{service?.name}</b>.
            </div>
            <div style="margin-top:18px;text-align:left;"><SummaryCard rows={waitlistSummary} /></div>
            {onClose ? <Button onClick={onClose}>Gotowe</Button> : <Button variant="ghost" onClick={restart}>Nowa rezerwacja</Button>}
          </div>
        )}
      </div>

      {showCta && (
        <div class="vz-cta">
          <div class="vz-cta-summary">
            <div class="vz-cta-left">
              {service ? (
                <>
                  <div class="vz-cta-svc">{service.name}</div>
                  <div class="vz-cta-meta"><b>{ctaPrice}</b> · {formatDuration(shownDuration)}</div>
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
