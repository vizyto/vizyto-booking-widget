import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { Business, CartItem, CartItemTime, Cfg, DayCounts, OAuthProvider, OtpMode, Resource, Service, ServiceCategory, Slots } from './api'
import {
  addonNames,
  addonTotals,
  addonsValid,
  bookingIdempotencyKey,
  checkBookingAccess,
  checkEmail,
  checkWaitlistWindow,
  configuredTotals,
  createAppointment,
  formatDuration,
  formatPrice2,
  getCartCounts,
  getCartFirstFree,
  getCartSlots,
  getServiceCategories,
  joinWaitlist,
  loginEmail,
  maskPhone,
  oauthLogin,
  priceRange,
  resolveVariant,
  sendGuestOtp,
  serviceHasOptions,
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
import { StepConfigure } from './steps/StepConfigure'
import { StepResource } from './steps/StepResource'
import { StepDateTime } from './steps/StepDateTime'
import { StepIdentify, type Contact } from './steps/StepIdentify'
import { StepWaitlist, type WaitlistPrefs } from './steps/StepWaitlist'
import { StepLogin } from './steps/StepLogin'
import { StepOtp } from './steps/StepOtp'
import { StepDone } from './steps/StepDone'
import { Notice } from './ui/Notice'
import { Bell, Lock, Phone } from './ui/icons'

const HORIZON = 42
const OTP_RESEND_MS = 60_000

// Add whole days to a YYYY-MM-DD string in UTC (DST-safe).
const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

type ResChoice = number | 'any'

// One cart position as the widget holds it: the service plus ITS OWN variant and
// add-ons. Keeping the configuration on the line (instead of in flow-level state)
// is what makes a second service possible without the two overwriting each other.
type CartLine = {
  service: Service
  /** Chosen length preset; null = the service's default (shortest) variant. */
  variantDuration: number | null
  addonIds: number[]
}

// A fresh line defaults to the variant the API would pick on its own, so the
// price shown before any configuring matches what gets booked.
const newLine = (service: Service): CartLine => ({
  service,
  variantDuration: resolveVariant(service, null)?.durationMinutes ?? null,
  addonIds: [],
})

/** Hard cap mirroring the API's MAX_CART_ITEMS - refuse the 9th politely. */
const MAX_CART_ITEMS = 8
type Phase = 'select' | 'identify' | 'login' | 'otp' | 'confirming' | 'done' | 'slotLost' | 'waitlist' | 'waitlistDone' | 'restricted'
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

  // selection (declared here because offeringWorkers below depends on the cart;
  // the rest of the selection state follows further down).
  const initialServiceRef = useMemo(() => services.find((s) => s.id === prefill?.serviceId) ?? null, [services, prefill?.serviceId])
  // The CART: array order = chain order (the engine books positions back to back).
  // Variant + add-ons live PER LINE, so configuring one service never touches
  // another. v1 keeps ONE provider for the whole cart (parytet z kreatorem WEB).
  const [lines, setLines] = useState<CartLine[]>(
    initialServiceRef ? [newLine(initialServiceRef)] : [],
  )
  const lineOf = (serviceId: number) => lines.find((l) => l.service.id === serviceId)
  const cartServices = useMemo(() => lines.map((l) => l.service), [lines])

  // A service can be offered by only a subset of workers, each possibly with an
  // overridden price/duration. The candidate list is the INTERSECTION: only
  // workers who perform EVERY position can take the whole cart alone. With an
  // empty cart the whole team drives structure.
  const offeringWorkers = useMemo(
    () => (lines.length
      ? workers.filter((w) => cartServices.every((svc) => workerOffersService(svc, w.id)))
      : workers),
    [workers, cartServices, lines.length],
  )

  // Offerings-pool F2/F3: a service is either staff-realized (customer picks a
  // worker) or unit-realized (customer picks an object from the primary pool, or
  // "Dowolny"). providerSelection 'auto' means the server assigns and there is no
  // pick step at all.
  // Cart-wide, jak w kreatorze WEB (computeIsUnitBooking / computeAllProvidersAuto
  // / computeUnitPickTag): a MIXED cart falls back to the staff path, and the
  // per-position guard in buildCartItems keeps a worker id off the pool lines.
  const isUnit = lines.length > 0 && cartServices.every((s) => s.fulfillmentMode === 'unit')
  const providerAuto = lines.length > 0 && cartServices.every((s) => s.providerSelection === 'auto')
  // Trim both sides of the pool match (web computeUnitPickTag/getSelectableUnits
  // trim too): a whitespace-bearing tag must not silently empty the pool. One
  // shared tag only - two different pools have no single "Dowolny" to offer.
  const unitTag = useMemo(() => {
    if (!isUnit) return null
    let tag: string | null = null
    for (const svc of cartServices) {
      const t = ((svc.primaryObjectCategoryTag ?? '') as string).trim() || null
      if (!t || (tag && tag !== t)) return null
      tag = t
    }
    return tag
  }, [isUnit, cartServices])
  // Bookable, customer-selectable objects of the cart's primary pool.
  const poolUnits = useMemo(() => {
    if (!lines.length || !isUnit || !unitTag) return []
    return business.resources.filter(
      (r) =>
        r.type === 'object' &&
        r.isBookable !== false &&
        r.isCustomerSelectable !== false &&
        (((r.categoryTag ?? '') as string).trim() || null) === unitTag,
    )
  }, [business, lines.length, isUnit, unitTag])
  // Whoever the customer chooses among for this service (memoized for stable
  // effect/memo deps).
  const selectableProviders = useMemo(() => (isUnit ? poolUnits : offeringWorkers), [isUnit, poolUnits, offeringWorkers])

  // With 0-1 providers, or providerSelection 'auto', there's no pick step: it is
  // skipped and the progress is a 3-step flow. "od" (from) pricing only applies
  // when a staff service's price can vary between workers.
  const hasResourceStep = !providerAuto && selectableProviders.length > 1
  const providerStepName = isUnit ? 'WYBÓR ZASOBU' : 'WYBÓR SPECJALISTY'
  const stepNames = hasResourceStep
    ? ['WYBÓR USŁUGI', providerStepName, 'WYBÓR TERMINU', 'TWOJE DANE']
    : ['WYBÓR USŁUGI', 'WYBÓR TERMINU', 'TWOJE DANE']
  const totalSteps = stepNames.length

  // Seed the provider from prefill (a tapped barber CTA), or auto-pick when the
  // chosen service has 0-1 selectable providers or assigns automatically.
  const initialResource = useMemo<ResChoice | null>(() => {
    // 'auto' wins over the prefill: the business decided the server assigns, so a
    // pinned worker from open({resourceId}) must never reach the payload. Checking
    // the prefill first also skipped the step (initialResource != null -> selStep 2),
    // so dalej()'s normalizer never ran and the pin shipped to counts/slots/create.
    if (lines.length && providerAuto) return 'any'
    if (prefill?.resourceId && selectableProviders.some((w) => w.id === prefill.resourceId)) return prefill.resourceId
    if (lines.length && selectableProviders.length === 0) return 'any'
    if (lines.length && selectableProviders.length === 1) return selectableProviders[0].id
    return null
  }, [selectableProviders, providerAuto, prefill?.resourceId, lines.length])

  // selection
  const [resource, setResource] = useState<ResChoice | null>(initialResource)
  // The customer chose "Dowolny" at the provider step. Refining WHO takes the
  // picked hour keeps this true: availability must stay union-wide (or the day
  // would shrink to that one person and the refinement would be a one-way door),
  // and the picker must stay on screen so the choice can be changed.
  const [anyChosen, setAnyChosen] = useState(initialResource === 'any')
  // configure sub-step (variants + add-ons) for the picked service. Auto-opens
  // when the service offers choices; hidden otherwise. variantDuration = chosen
  // length preset (null = default shortest); addonIds = selected add-ons.
  // Which cart line is open in the configure sub-step (null = none). Per line,
  // so configuring the 2nd service never disturbs the 1st.
  const [configuringId, setConfiguringId] = useState<number | null>(
    initialServiceRef && serviceHasOptions(initialServiceRef) ? initialServiceRef.id : null,
  )
  const configuring = configuringId != null
  const configuringLine = configuringId != null ? lineOf(configuringId) : undefined
  const [date, setDate] = useState('')
  const [slotKey, setSlotKey] = useState('')
  const [counts, setCounts] = useState<DayCounts>({})
  const [slots, setSlots] = useState<Slots>([])
  // Chain geometry + per-slot candidates from the last availability answer.
  const [chain, setChain] = useState<{ itemTimes: CartItemTime[]; totalMinutes: number; slotCandidates?: Record<string, number[][]> } | null>(null)
  const [loadingSlots, setLoadingSlots] = useState(false)
  // Transient one-liner under the service list (pin dropped, cart cap reached).
  const [cartNotice, setCartNotice] = useState('')
  // "Najbliższy wolny termin": in flight + a latch once a sweep came back empty,
  // so we stop offering a search that already failed for this cart.
  const [findingNext, setFindingNext] = useState(false)
  const [noneAhead, setNoneAhead] = useState(false)
  const [refetch, setRefetch] = useState(0)
  // 0 service, 1 specialist, 2 termin - skip ahead when prefilled. A prefilled
  // service that offers variants/add-ons stays on step 0 so the customer
  // configures it (auto-opened above) before advancing.
  const [selStep, setSelStep] = useState(
    initialServiceRef && serviceHasOptions(initialServiceRef)
      ? 0
      : initialServiceRef && initialResource != null
        ? 2
        : initialServiceRef
          ? 1
          : 0,
  )

  // flow
  const [phase, setPhase] = useState<Phase>('select')
  const [contact, setContact] = useState<Contact>(emptyContact)
  const [notes, setNotes] = useState('')
  const [emailExists, setEmailExists] = useState(false)
  const [auth, setAuth] = useState<Auth | null>(preAuth ?? null)

  // Service categories (optional grouping) fetched from a separate public endpoint.
  const [categories, setCategories] = useState<ServiceCategory[]>([])

  // ---- whitelist gate (bookingAccess) ----
  // accessOk = the viewer is confirmed allowed to book at business level.
  // Starts false for a 'restricted' business until a post-login probe says yes
  // (fetchBusiness is anonymous, so viewerCanBook is null there).
  const initialAccessOk = business.bookingAccess?.policy !== 'restricted' || business.bookingAccess?.viewerCanBook === true
  const [accessOk, setAccessOk] = useState(initialAccessOk)
  // Availability/counts answered 403 BOOKING_ACCESS_RESTRICTED for this viewer:
  // the calendar shows a login invitation instead of a silently empty grid.
  const [calRestricted, setCalRestricted] = useState(false)

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
  // 'login' = this phone already has a Vizyto account; the code doubles as a login.
  const [otpMode, setOtpMode] = useState<OtpMode>('guest')
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

  // Which resourceId ONE position may carry. The cart-wide pick is a WORKER, so
  // it must not land on a pool position ('unit' - the engine wants an object
  // there and answers with zero slots for the whole day) nor on a position the
  // business assigns itself ('auto'). Same rule as WEB's resolveItemResourceId.
  const itemResourceId = (svc: Service): number | null => {
    if (svc.providerSelection === 'auto') return null
    if (svc.fulfillmentMode === 'unit') {
      const picked = typeof resource === 'number'
        ? business.resources.find((r) => r.id === resource)
        : undefined
      return picked?.type === 'object' ? picked.id : null
    }
    return resourceId ?? null
  }

  // The cart as the API wants it: array order = chain order, each position with
  // its OWN variant length and add-ons, so availability and create always agree
  // on the chain shape.
  const buildCartItems = (opts?: { forAvailability?: boolean }): CartItem[] => lines.map((l) => ({
    businessServiceId: l.service.id,
    // Availability in "Dowolny" mode ignores a slot-level refinement on purpose
    // (parytet z availabilityItems w WEB); create uses the concrete pick.
    resourceId: opts?.forAvailability && anyChosen ? null : itemResourceId(l.service),
    addonIds: l.addonIds.length ? l.addonIds : undefined,
    durationMinutes: l.variantDuration ?? undefined,
  }))

  // Stable dep for availability effects: composition, variants and add-ons all
  // change the chain length, so counts/slots must refetch when any of them move.
  const cartKey = lines
    .map((l) => `${l.service.id}:${l.variantDuration ?? ''}:${l.addonIds.slice().sort((a, b) => a - b).join('.')}`)
    .join('|')
  const days = useMemo(() => nextDays(HORIZON), [])
  // The pinned provider (worker or pool unit); undefined for "Dowolny"/auto.
  const pinnedResource: Resource | undefined = typeof resource === 'number' ? business.resources.find((r) => r.id === resource) : undefined
  const anyProviderLabel = isUnit ? (unitTag ? `Dowolny: ${unitTag}` : 'Dowolny') : 'Dowolny specjalista'
  const providerName = resource === 'any' || resource == null ? anyProviderLabel : pinnedResource?.name ?? ''
  const providerRowLabel = isUnit ? 'Zasób' : 'Specjalista'

  useEffect(() => {
    let cancelled = false
    getServiceCategories(cfg).then((c) => !cancelled && setCategories(c))
    return () => {
      cancelled = true
    }
  }, [])

  // bookedById resolves the whitelist gate for the logged-in user (anonymously
  // a restricted business 403s), so both queries re-run after authentication.
  useEffect(() => {
    if (!lines.length) return
    let cancelled = false
    getCartCounts(cfg, {
      startDate: days[0],
      endDate: days[days.length - 1],
      items: buildCartItems({ forAvailability: true }),
      bookedById: auth?.userId,
    }).then((x) => {
      if (cancelled) return
      setCounts(x.counts)
      setCalRestricted(x.restricted)
    })
    return () => {
      cancelled = true
    }
  }, [cartKey, resourceId, refetch, auth?.userId])

  // A different cart may well have free days - forget the previous verdict.
  useEffect(() => { setNoneAhead(false) }, [cartKey, resourceId])

  useEffect(() => {
    if (!lines.length || !date) {
      setSlots([])
      setChain(null)
      return
    }
    let cancelled = false
    setLoadingSlots(true)
    // Ask for per-slot candidates only when they can drive a real choice: one
    // position, "Dowolny", staff-realized (a pool has its own pick step).
    const wantsCandidates = lines.length === 1 && anyChosen && !isUnit && !providerAuto
    getCartSlots(cfg, { date, items: buildCartItems({ forAvailability: true }), bookedById: auth?.userId, includeCandidates: wantsCandidates })
      .then((x) => {
        if (cancelled) return
        setSlots(x.slots)
        setChain({ itemTimes: x.itemTimes, totalMinutes: x.totalMinutes, slotCandidates: x.slotCandidates })
        if (x.restricted) setCalRestricted(true)
      })
      .finally(() => !cancelled && setLoadingSlots(false))
    return () => {
      cancelled = true
    }
  }, [cartKey, resourceId, date, refetch, auth?.userId])

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

  // Effective price/duration for the current configuration: chosen variant +
  // add-ons + any per-employee override for a pinned worker. When nothing pins
  // the price yet (no worker, no variant), fall back to the "od {min}" range
  // across the offering workers.
  const chosenWorker = typeof resource === 'number' ? resource : undefined
  // Cart totals: every position priced at the pinned worker's rate (or its base),
  // summed. One position still priced as a range makes the whole total a range,
  // so "od" propagates up - jak w kreatorze WEB.
  const cartTotals = lines.reduce(
    (acc, l) => {
      const t = configuredTotals(l.service, l.variantDuration, l.addonIds, chosenWorker)
      return { price: acc.price + t.price, duration: acc.duration + t.duration }
    },
    { price: 0, duration: 0 },
  )
  const lineIsRange = (l: CartLine) => {
    if (chosenWorker) return false
    if ((l.service.durationOptions?.length ?? 0) > 0) return false
    const r = priceRange(l.service, workers.filter((w) => workerOffersService(l.service, w.id)))
    return r.min !== r.max
  }
  const showFrom = lines.length > 0 && lines.some(lineIsRange)
  // Lower bound when at least one position is a range: cheapest performer per
  // position + that position's add-ons.
  const cartFromPrice = lines.reduce((sum, l) => {
    const performers = workers.filter((w) => workerOffersService(l.service, w.id))
    const r = priceRange(l.service, performers)
    const variant = resolveVariant(l.service, l.variantDuration)
    const base = variant?.priceCents ?? (lineIsRange(l) ? r.min : configuredTotals(l.service, l.variantDuration, [], chosenWorker).price)
    return sum + base + addonTotals(l.service, l.addonIds).price
  }, 0)
  const shownPrice = showFrom ? cartFromPrice : cartTotals.price
  const shownDuration = cartTotals.duration
  // Price used for analytics/booking value: exact configured totals (the backend
  // assigns the final price for "Dowolny"; base + add-ons is our best estimate).
  const selectedPrice = cartTotals.price

  // One row per position (with its variant + add-ons folded into the label), then
  // the shared provider, the time and the total. A 1-item cart reads exactly like
  // before; a chain shows what it is made of.
  const summaryRows: SummaryRow[] = lines.length
    ? [
        ...lines.map((l) => {
          const variant = resolveVariant(l.service, l.variantDuration)
          const hasVariantChoice = (l.service.durationOptions?.length ?? 0) > 0
          const names = addonNames(l.service, l.addonIds)
          const extras = [
            ...(hasVariantChoice && variant ? [variant.label || formatDuration(variant.durationMinutes)] : []),
            ...names,
          ]
          return {
            label: l.service.name,
            value: extras.length ? extras.join(' · ') : formatDuration(configuredTotals(l.service, l.variantDuration, l.addonIds, chosenWorker).duration),
          }
        }),
        { label: providerRowLabel, value: providerName },
        { label: 'Termin', value: `${dayMonth(date)}, ${slotLabel(date, slotKey, business.timezone)}` },
        { label: 'Cena', value: `${showFrom ? 'od ' : ''}${formatPrice2(shownPrice)}`, total: true },
      ]
    : []

  // Summary shown on the identify step when the intent is a waitlist sign-up
  // (no fixed time/price yet - just the service, specialist and date range).
  const waitlistSummary: SummaryRow[] = lines.length === 1
    ? [
        { label: 'Usługa', value: lines[0]!.service.name },
        { label: providerRowLabel, value: providerName },
        {
          label: 'Zakres',
          value: wlPrefs
            ? `od ${dayMonth(addDays(date, wlPrefs.startOffset))} · ${wlPrefs.rangeDays} ${wlPrefs.rangeDays === 1 ? 'dzień' : 'dni'}`
            : dayMonth(date),
        },
      ]
    : []

  // Refining "Dowolny" to a person AFTER the hour is picked: no earlier, because
  // only then do we know who is actually free. Gated to a single staff position -
  // one pick cannot describe a chain, and a pool has its own step.
  const slotPicker = useMemo(() => {
    if (lines.length !== 1 || !anyChosen || isUnit || providerAuto) return null
    if (!slotKey || !chain?.slotCandidates) return null
    const ids = chain.slotCandidates[slotKey]?.[0] ?? []
    const line = lines[0]!
    const candidates = ids
      .map((id) => workers.find((w) => w.id === id))
      .filter((w): w is Resource => !!w && w.isCustomerSelectable !== false)
      .map((w) => ({
        id: w.id,
        name: w.name,
        price: formatPrice2(configuredTotals(line.service, line.variantDuration, line.addonIds, w.id).price),
      }))
    // Nothing to choose from when everyone charges the same - the pick would add
    // a decision without adding information.
    const prices = new Set(candidates.map((c) => c.price))
    if (candidates.length < 2 || prices.size < 2) return null
    return {
      candidates,
      selectedId: typeof resource === 'number' ? resource : null,
      onPick: (id: number | null) => {
        // Keep the slot: the person came FROM this slot's free list.
        setResource(id ?? 'any')
        if (id != null) emit('specialist_selected', { ...resourceEvent(id), atSlot: true })
      },
    }
  }, [lines, anyChosen, resource, isUnit, providerAuto, slotKey, chain, workers])

  async function findNextFree() {
    if (!lines.length || findingNext) return
    setFindingNext(true)
    const hit = await getCartFirstFree(cfg, { items: buildCartItems({ forAvailability: true }), from: date || undefined, bookedById: auth?.userId })
    setFindingNext(false)
    if (hit) {
      setDate(hit.date)
      setSlotKey('')
    } else {
      setNoneAhead(true)
    }
  }

  // The picked start turned into a per-position plan. itemTimes comes from the
  // server (the widget never computes the chain itself), so what we show is what
  // the engine planned.
  const chainPlan = useMemo(() => {
    if (!chain || !slotKey || !date || lines.length < 2) return null
    // Offsets are minutes from the chain start; shifting the UTC slot key by them
    // and formatting through the shared helper keeps one timezone code path.
    const [hh, mm] = slotKey.split(':').map(Number)
    const shifted = (mins: number) => {
      const total = (hh ?? 0) * 60 + (mm ?? 0) + mins
      return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
    }
    return {
      rows: chain.itemTimes.map((it) => ({
        time: slotLabel(date, shifted(it.startOffsetMinutes), business.timezone),
        name: lines[it.itemIndex]?.service.name ?? '',
        duration: formatDuration(it.durationMinutes),
      })),
      total: formatDuration(chain.totalMinutes),
    }
  }, [chain, slotKey, date, lines, business.timezone])

  /** Short "wariant · dodatki" recap under a cart row (empty when nothing chosen). */
  const lineRecap = (l: CartLine): string => {
    const variant = resolveVariant(l.service, l.variantDuration)
    const hasVariantChoice = (l.service.durationOptions?.length ?? 0) > 0
    const bits = [
      ...(hasVariantChoice && variant ? [variant.label || formatDuration(variant.durationMinutes)] : []),
      ...addonNames(l.service, l.addonIds),
    ]
    return bits.join(' · ')
  }

  // Nobody performs the whole cart alone: the step says so and names who does
  // what, instead of leaving "Dowolny" as an unexplained only option (parytet z WEB).
  const noSoloCandidate = lines.length > 1 && !isUnit && offeringWorkers.length === 0
  const performersByService = useMemo(
    () => lines.map((l) => ({
      serviceName: l.service.name,
      // The ENGINE's candidates (every worker performing it), not just the
      // customer-selectable ones - the server is what assigns here.
      names: workers.filter((w) => workerOffersService(l.service, w.id)).map((w) => w.name),
    })),
    [lines, workers],
  )

  // Waitlist v1 is keyed on ONE businessServiceId and carries no duration, so a
  // chain, an add-on or a longer variant would make us notify about a slot the
  // visit does not fit (ta sama brama co w WEB i CLIENT).
  const waitlistLine = lines.length === 1 ? lines[0]! : null
  const canWaitlist = business.waitlistEnabled !== false
    && !!waitlistLine
    && waitlistLine.addonIds.length === 0
    && !isUnit
    && (() => {
      const def = resolveVariant(waitlistLine.service, null)
      const cur = resolveVariant(waitlistLine.service, waitlistLine.variantDuration)
      return !cur || !def || cur.durationMinutes === def.durationMinutes
    })()

  async function book(a: Auth, key = slotKey) {
    if (!lines.length || !date || !key || booking.current) return
    booking.current = true
    setBookingErr('')
    setPhase('confirming')
    const ctx = bookingCtx(key)
    emit('booking_submitted', { ...ctx, userId: a.userId })
    const items = buildCartItems()
    const startDate = slotStartDate(date, key)
    const trimmedNotes = notes.trim() || undefined
    const r = await createAppointment(
      cfg,
      {
        items,
        startDate,
        bookedById: a.userId,
        notes: trimmedNotes,
        idempotencyKey: bookingIdempotencyKey({ businessId: business.id, startDate, items, bookedById: a.userId, notes: trimmedNotes }),
      },
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
    // PHONE_VERIFICATION_REQUIRED: the account's phoneVerified flag dropped
    // after the session was minted (e.g. a number change in the app) - the
    // widget's own OTP re-login is exactly the verification the API wants.
    if (r.code === 'BOOKED_BY_MISMATCH' || r.code === 'VERIFICATION_REQUIRED' || r.code === 'PHONE_VERIFICATION_REQUIRED') {
      setAuth(null)
      setIdentifyErr('Potwierdź numer telefonu, aby dokończyć rezerwację.')
      setPhase('identify')
      emit('booking_failed', { ...ctx, code: r.code, reason: 'verification_required' })
      return
    }
    if (r.code === 'BOOKING_ACCESS_RESTRICTED') {
      // Backstop: the server-side whitelist gate refused the write (the probe
      // failed open or access changed mid-flow). Same screen as the soft check.
      setPhase('restricted')
      emit('booking_access_denied', { userId: a.userId, serviceId: lines[0]?.service.id ?? null, stage: 'create' })
      emit('booking_failed', { ...ctx, code: r.code, reason: 'access_restricted' })
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

  // Hard whitelist check right after any path that establishes a session (OTP
  // verify, e-mail login, OAuth). Resolves access for the actual user and the
  // selected service; anything but 'bookable' stops before the booking step.
  // Runs while the caller's busy flag is still up, so the button keeps spinning.
  async function ensureBookingAccess(a: Auth): Promise<boolean> {
    const anyLocked = cartServices.some((s) => s.viewerAccess === 'locked')
    const needsCheck = business.bookingAccess?.policy === 'restricted' || anyLocked || calRestricted
    if (!needsCheck) return true
    // EVERY position has to clear the whitelist - one locked service in a chain
    // would otherwise be caught only by the create backstop, after the OTP.
    if (!cartServices.length) {
      const r = await checkBookingAccess(cfg, { bookedById: a.userId })
      if (r.viewerCanBook === false) {
        setPhase('restricted')
        emit('booking_access_denied', { userId: a.userId, serviceId: null, stage: 'check' })
        return false
      }
      if (r.viewerCanBook === true) setAccessOk(true)
      setCalRestricted(false)
      return true
    }
    for (const svc of cartServices) {
      const r = await checkBookingAccess(cfg, { bookedById: a.userId, businessServiceId: svc.id })
      if (r.serviceAccess !== 'bookable') {
        setPhase('restricted')
        emit('booking_access_denied', { userId: a.userId, serviceId: svc.id, stage: 'check' })
        return false
      }
      if (r.viewerCanBook === true) setAccessOk(true)
    }
    setCalRestricted(false)
    return true
  }

  // After authentication, either book the chosen slot or join the waitlist.
  // No slot yet (access-check login from the banner / locked calendar): the
  // viewer is confirmed - just resume selection where they left off.
  function complete(a: Auth) {
    if (intent === 'waitlist') void submitWaitlist(a)
    else if (lines.length && date && slotKey) void book(a)
    else setPhase('select')
  }

  const waitlistErrorMsg = (code: string) =>
    code === 'WAITLIST_DUPLICATE'
      ? 'Już czekasz na termin tej usługi w tym zakresie dat.'
      : code === 'WAITLIST_LIMIT_REACHED'
        ? 'Masz już 3 aktywne zapisy - usuń któryś w profilu Vizyto, aby dodać nowy.'
        : code === 'WAITLIST_DISABLED'
          ? 'Ten salon nie prowadzi listy oczekujących.'
          : code === 'WAITLIST_SLOTS_AVAILABLE'
            ? 'W tym zakresie są wolne terminy - wybierz godzinę w kalendarzu.'
            : code === 'INCOMPLETE_PROFILE'
            ? 'Uzupełnij imię, nazwisko i telefon, aby zapisać się na listę.'
            : code === 'NETWORK'
              ? 'Brak połączenia. Spróbuj ponownie.'
              : 'Nie udało się zapisać na listę. Spróbuj ponownie.'

  async function submitWaitlist(a: Auth, prefs = wlPrefs) {
    const service = waitlistLine?.service
    if (!service || !date || !prefs || wlBusy) return
    setWlBusy(true)
    setWlErr('')
    const dateFrom = addDays(date, prefs.startOffset)
    const dateTo = addDays(dateFrom, prefs.rangeDays - 1)
    const r = await joinWaitlist(
      cfg,
      { businessServiceId: service.id, resourceId: resourceId ?? null, dateFrom, dateTo, timeFrom: prefs.timeFrom, timeTo: prefs.timeTo, bookedById: a.userId },
      a.token,
    )
    setWlBusy(false)
    if (r.ok) {
      setPhase('waitlistDone')
      emit('waitlist_joined', {
        serviceId: service.id,
        serviceName: service.name,
        ...resourceEvent(resource ?? 'any'),
        dateFrom,
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
    emit('waitlist_started', { serviceId: waitlistLine?.service.id, ...resourceEvent(resource ?? 'any'), date })
    setPhase('waitlist')
  }

  function onWaitlistFormSubmit(prefs: WaitlistPrefs) {
    setWlPrefs(prefs)
    if (auth) void submitWaitlist(auth, prefs)
    else {
      emit('details_started', { serviceId: waitlistLine?.service.id, waitlist: true })
      setPhase('identify')
    }
  }

  // Resolve a specialist choice to a stable {id,name} shape for event payloads.
  const resourceEvent = (r: ResChoice) =>
    r === 'any'
      ? { resourceId: null, resourceName: anyProviderLabel }
      : { resourceId: r, resourceName: business.resources.find((x) => x.id === r)?.name ?? '' }

  // The full booking context shared by every funnel event past slot selection.
  // Funnel payloads keep the legacy scalar fields (serviceId/serviceName point at
  // the FIRST position, so existing GA4/GTM setups keep working) and gain the
  // cart shape next to them. No PII, jak dotąd.
  const bookingCtx = (key = slotKey) => ({
    serviceId: lines[0]?.service.id,
    serviceName: lines[0]?.service.name,
    serviceIds: lines.map((l) => l.service.id),
    serviceNames: lines.map((l) => l.service.name),
    itemCount: lines.length,
    price: lines.length ? selectedPrice : undefined,
    ...resourceEvent(resource ?? 'any'),
    date,
    time: key ? slotLabel(date, key, business.timezone) : '',
    startDate: key ? slotStartDate(date, key) : '',
  })

  // ---- selection (select-then-Dalej) ----
  /**
   * Toggle a service in the cart. Adding keeps the cart-wide specialist only when
   * they perform EVERY position (jak applyToggleService w WEB) - otherwise the pin
   * is dropped, because the chain would dead-end at the time step.
   */
  function toggleService(s: Service) {
    const existing = lineOf(s.id)
    if (existing) {
      const next = lines.filter((l) => l.service.id !== s.id)
      setLines(next)
      if (configuringId === s.id) setConfiguringId(null)
      setDate('')
      setSlotKey('')
      emit('service_removed', { serviceId: s.id, serviceName: s.name, itemCount: next.length })
      return
    }
    if (lines.length >= MAX_CART_ITEMS) {
      setCartNotice(`Możesz wybrać maksymalnie ${MAX_CART_ITEMS} usług.`)
      return
    }
    const next = [...lines, newLine(s)]
    setLines(next)
    // Drop a pinned worker who cannot take the new composition, and say why.
    if (typeof resource === 'number') {
      const picked = business.resources.find((r) => r.id === resource)
      const stillValid = picked?.type === 'worker'
        && next.every((l) => l.service.fulfillmentMode !== 'unit' && workerOffersService(l.service, resource))
      if (!stillValid) {
        setResource(null)
        setCartNotice(picked?.name
          ? `${picked.name} nie wykonuje usługi ${s.name}. Wybierz specjalistę ponownie.`
          : 'Wybierz specjalistę ponownie - zmienił się skład wizyty.')
      }
    }
    setDate('')
    setSlotKey('')
    // A service with variants/add-ons opens its configuration right away.
    if (serviceHasOptions(s)) setConfiguringId(s.id)
    emit('service_selected', { serviceId: s.id, serviceName: s.name, price: s.price, durationMin: s.duration, itemCount: next.length })
  }

  /** Reopen the configuration of a cart position (variant + add-ons). */
  function editLine(serviceId: number) {
    if (lineOf(serviceId)) setConfiguringId(serviceId)
  }

  function pickResource(r: ResChoice) {
    if (r !== resource) {
      setResource(r)
      setAnyChosen(r === 'any')
      setDate('')
      setSlotKey('')
      emit('specialist_selected', resourceEvent(r))
    }
  }
  function pickVariant(durationMinutes: number) {
    if (configuringId == null) return
    setLines((prev) => prev.map((l) => (l.service.id === configuringId ? { ...l, variantDuration: durationMinutes } : l)))
    // The chain length changed - the chosen day/slot may no longer fit.
    setDate('')
    setSlotKey('')
  }
  function toggleAddon(id: number) {
    if (configuringId == null) return
    setLines((prev) => prev.map((l) => (
      l.service.id === configuringId
        ? { ...l, addonIds: l.addonIds.includes(id) ? l.addonIds.filter((x) => x !== id) : [...l.addonIds, id] }
        : l
    )))
    setDate('')
    setSlotKey('')
  }
  function confirmConfigure() {
    const line = configuringLine
    if (line && !addonsValid(line.service, line.addonIds)) return
    setConfiguringId(null)
    if (line) {
      emit('addons_selected', {
        serviceId: line.service.id,
        variantDurationMin: line.variantDuration ?? undefined,
        addonIds: line.addonIds,
        addonCount: line.addonIds.length,
      })
    }
  }
  function dalej() {
    if (selStep === 0) {
      if (!cartValid) return
      if (!hasResourceStep) {
        // No pick step: providerSelection 'auto', or 0-1 selectable providers.
        const r: ResChoice = !providerAuto && selectableProviders.length === 1 ? selectableProviders[0].id : 'any'
        setResource(r)
        setAnyChosen(r === 'any')
        setSelStep(2)
        emit('specialist_selected', { ...resourceEvent(r), auto: true })
      } else setSelStep(1)
    } else if (selStep === 1) {
      if (!resourceValid) return
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
    // Back to the service list - other services may still be bookable for this viewer.
    if (phase === 'restricted') return () => { setSelStep(0); setPhase('select') }
    if (phase === 'select') {
      // Configuring overlays the selection - back just closes it, keeping choices.
      if (configuring) return () => setConfiguringId(null)
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
    setOtpMode(r.mode)
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
    setOtpMode(r.mode)
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
    if (r.ok) {
      const a = { userId: r.data.userId, token: r.data.token }
      setAuth(a)
      emit('otp_verified', { userId: a.userId })
      emit('authenticated', { method: r.mode === 'login' ? 'otp-login' : 'otp', userId: a.userId })
      const allowed = await ensureBookingAccess(a)
      setVerifying(false)
      if (allowed) complete(a)
      return
    }
    setVerifying(false)
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
    if (!r.ok) {
      setLoggingIn(false)
      setLoginErr(r.code === 'SITE_KEY_REQUIRED' ? 'Rezerwacja jest chwilowo niedostępna.' : 'Nieprawidłowy e-mail lub hasło.')
      return
    }
    const a = { userId: r.data.userId, token: r.data.token }
    setAuth(a)
    emit('authenticated', { method: 'password', userId: a.userId })
    const allowed = await ensureBookingAccess(a)
    setLoggingIn(false)
    if (allowed) complete(a)
  }
  async function onOAuth(provider: OAuthProvider) {
    if (oauthBusy || loggingIn) return
    setOauthBusy(provider)
    setLoginErr('')
    const r = await oauthLogin(cfg, provider)
    if (!r.ok) {
      setOauthBusy(null)
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
    const allowed = await ensureBookingAccess(a)
    setOauthBusy(null)
    if (allowed) complete(a)
  }
  function goLogin() {
    setLoginReason('')
    setLoginErr('')
    setPhase('login')
  }
  // Shortcut from the access banner / locked calendar: jump into the phone
  // identify step before any slot is chosen, purely to establish who the viewer
  // is. After auth, ensureBookingAccess() + complete() resume selection.
  function goAccessLogin() {
    setIntent('book')
    setIdentifyErr('')
    emit('details_started', { serviceId: lines[0]?.service.id ?? null, accessCheck: true })
    setPhase('identify')
  }
  function recoverSlot() {
    setSlotKey('')
    setSlots([])
    setBookingErr('')
    setRefetch((x) => x + 1)
    setSelStep(2)
    setPhase('select')
  }
  function restart() {
    setLines([])
    setResource(null)
    setAnyChosen(false)
    setConfiguringId(null)
    setCartNotice('')
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
    setAccessOk(initialAccessOk)
    setCalRestricted(false)
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
  const showCta = phase === 'select' && !configuring
  // Whitelist banner on the selection phases: only for an unconfirmed viewer,
  // and not while the calendar already shows its own dedicated login prompt.
  const showAccessBanner =
    business.bookingAccess?.policy === 'restricted' && !accessOk && !auth && phase === 'select' && !(selStep === 2 && calRestricted)
  // tel: link for the restricted screen (spaces/dashes stripped).
  const businessPhone = business.phone?.trim() || ''
  // A pinned provider must belong to the current service's selectable set;
  // "any" (Dowolny/auto) is always valid. Guards a stale id from a previous
  // service from surviving into an enabled "Dalej".
  const resourceValid = resource === 'any' || (typeof resource === 'number' && selectableProviders.some((p) => p.id === resource))
  // Every position must satisfy its own add-on groups before the cart can move on.
  const cartValid = lines.length > 0 && !configuring && lines.every((l) => addonsValid(l.service, l.addonIds))
  const canAdvance = selStep === 0 ? cartValid : selStep === 1 ? resourceValid : !!slotKey
  const ctaPrice = lines.length ? `${showFrom ? 'od ' : ''}${formatPrice2(shownPrice)}` : ''

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
        {phase !== 'done' && phase !== 'waitlistDone' && phase !== 'restricted' && (
          <ProgressBar step={progStep} total={totalSteps} label={stepNames[progStep]} />
        )}

        {business.isTestMode && (phase === 'select' || phase === 'identify' || phase === 'waitlist') && (
          <Notice title="Rezerwacja próbna">
            Ten salon dopiero uruchamia rezerwacje online. Złożona tu rezerwacja nie jest jeszcze wiążąca - potwierdź ją bezpośrednio z salonem.
          </Notice>
        )}

        {showAccessBanner && (
          <Notice title="Rezerwacje online dla stałych klientów">
            Zaloguj się numerem telefonu, aby sprawdzić swój dostęp.{' '}
            <button class="vz-link" onClick={goAccessLogin} type="button">Zaloguj się</button>
          </Notice>
        )}

        {phase === 'select' && configuringLine && (
          <StepConfigure
            service={configuringLine.service}
            variantDuration={configuringLine.variantDuration}
            addonIds={configuringLine.addonIds}
            workerId={chosenWorker}
            onPickVariant={pickVariant}
            onToggleAddon={toggleAddon}
            onDone={confirmConfigure}
          />
        )}
        {phase === 'select' && !configuring && selStep === 0 && (
          <>
            {cartNotice && <Notice title="Zmienił się skład wizyty">{cartNotice}</Notice>}
            <StepService
              services={services}
              workers={workers}
              categories={categories}
              cart={lines.map((l) => ({
                serviceId: l.service.id,
                recap: lineRecap(l),
                editable: serviceHasOptions(l.service),
              }))}
              onToggle={toggleService}
              onEdit={editLine}
            />
          </>
        )}
        {phase === 'select' && !configuring && selStep === 1 && lines.length > 0 && (
          <StepResource
            providers={selectableProviders}
            items={lines}
            mode={isUnit ? 'unit' : 'staff'}
            anyLabel={anyProviderLabel}
            selected={resource}
            onPick={pickResource}
            performers={noSoloCandidate ? performersByService : undefined}
          />
        )}
        {phase === 'select' && !configuring && selStep === 2 && lines.length > 0 && calRestricted && (
          // Availability answered BOOKING_ACCESS_RESTRICTED for this (anonymous)
          // viewer - invite a login instead of rendering an empty calendar.
          <div class="vz-fade-in" style="text-align:center;padding:8px 0;">
            <div class="vz-check warn"><Lock size={26} /></div>
            <div class="vz-done-title" style="font-size:18px;">Usługa dla stałych klientów</div>
            <p class="vz-lead" style="margin-top:8px;">
              Ten salon udostępnia rezerwacje online wybranym klientom. Zaloguj się numerem telefonu, aby sprawdzić swój dostęp.
            </p>
            <button class="vz-btn mt" onClick={goAccessLogin} type="button">Zaloguj się</button>
          </div>
        )}
        {phase === 'select' && !configuring && selStep === 2 && lines.length > 0 && !calRestricted && (
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
            onFindNext={findNextFree}
            findingNext={findingNext}
            noneAhead={noneAhead}
            chain={chainPlan}
            slotPicker={slotPicker}
          />
        )}

        {phase === 'waitlist' && waitlistLine && (
          <StepWaitlist
            serviceName={waitlistLine.service.name}
            workerName={providerName}
            date={date}
            onSubmit={onWaitlistFormSubmit}
            onShowSlots={(d) => {
              // The pre-check found free slots in the chosen window - jump the
              // calendar there instead of accepting a pointless signup.
              setDate(d)
              setSlotKey('')
              setPhase('select')
            }}
            check={(win) =>
              checkWaitlistWindow(cfg, { businessServiceId: waitlistLine.service.id, resourceId: resourceId ?? null, ...win })
            }
            busy={wlBusy}
            error={wlErr}
          />
        )}

        {phase === 'identify' && (
          <StepIdentify
            // Access-check login (no slot picked yet): no summary and no notes -
            // the user is only confirming who they are.
            summary={intent === 'waitlist' ? waitlistSummary : slotKey ? summaryRows : []}
            contact={contact}
            onChange={onContactChange}
            notes={intent === 'waitlist' || !slotKey ? undefined : notes}
            onNotes={intent === 'waitlist' || !slotKey ? undefined : setNotes}
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
            existingAccount={otpMode === 'login'}
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
        {phase === 'restricted' && (
          <div class="vz-fade-in" style="text-align:center;padding:8px 0;">
            <div class="vz-check warn"><Lock size={26} /></div>
            <div class="vz-done-title" style="font-size:18px;">Rezerwacje dla wybranych klientów</div>
            <p class="vz-lead" style="margin-top:8px;">
              Rezerwacje online w tym salonie są dostępne dla wybranych klientów. Skontaktuj się z salonem, aby umówić wizytę.
            </p>
            {businessPhone && (
              <a class="vz-btn mt" href={`tel:${businessPhone.replace(/[\s\-()]/g, '')}`}>
                <Phone size={17} /> Zadzwoń: {businessPhone}
              </a>
            )}
            <button
              class={`vz-btn${businessPhone ? ' ghost' : ' mt'}`}
              onClick={() => { setSelStep(0); setPhase('select') }}
              type="button"
            >
              Wróć do usług
            </button>
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
              Damy Ci znać SMS-em{contact.email ? ' i e-mailem' : ''}, gdy tylko zwolni się pasujący termin usługi <b style="color:var(--vz-text)">{waitlistLine?.service.name}</b>.
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
              {lines.length ? (
                <>
                  <div class="vz-cta-svc">
                    {lines.length === 1
                      ? lines[0]!.service.name
                      : `${lines.length} ${lines.length < 5 ? 'usługi' : 'usług'}`}
                  </div>
                  <div class="vz-cta-meta"><b>{ctaPrice}</b> · {formatDuration(shownDuration)}</div>
                  {lines.length === 1 && serviceHasOptions(lines[0]!.service) && (
                    <div class="vz-cta-cfg">
                      <button class="vz-link" onClick={() => setConfiguringId(lines[0]!.service.id)} type="button">Zmień wariant / dodatki</button>
                    </div>
                  )}
                </>
              ) : (
                <div class="vz-cta-meta">Wybierz usługę, aby kontynuować</div>
              )}
            </div>
            {selStep >= 1 && resource != null && (
              <div class="vz-cta-who">
                <span class="vz-card-av">{pinnedResource?.image ? <img src={pinnedResource.image} alt="" /> : pinnedResource ? pinnedResource.name.charAt(0) : '✦'}</span>
                <span>{resource === 'any' ? 'Dowolny' : pinnedResource?.name}</span>
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
