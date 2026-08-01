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
import {
  canPickPerItem,
  clearStaffPins,
  dropInvalidPins,
  enterPerItemMode,
  getItemProviderMode,
  getPinnedResourceIds,
  getResourcesForService,
  getStaffItems,
  setAllItemResources,
  setItemResource,
} from './providerMode'
import { noopEmit, type EmitFn } from './events'
import { ProgressBar } from './ui/ProgressBar'
import { Spinner } from './ui/Spinner'
import { Powered } from './ui/Powered'
import { ArrowLeft, ArrowRight, Close } from './ui/icons'
import { SummaryCard, type SummaryRow } from './ui/SummaryCard'
import { AvatarStack } from './ui/AvatarStack'
import { Button } from './ui/Button'
import { StepService } from './steps/StepService'
import { StepConfigure } from './steps/StepConfigure'
import { StepResource } from './steps/StepResource'
import { StepDateTime } from './steps/StepDateTime'
import { ItemProviders } from './steps/ItemProviders'
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

// One cart position as the widget holds it: the service plus ITS OWN variant,
// add-ons and provider. Keeping all of it on the line (instead of in flow-level
// state) is what makes a second service possible without the two overwriting
// each other - and what lets each service have its own specialist.
type CartLine = {
  service: Service
  /** Chosen length preset; null = the service's default (shortest) variant. */
  variantDuration: number | null
  addonIds: number[]
  /** undefined = nothing chosen yet, null = "bez preferencji", number = pinned. */
  resourceId?: number | null
}

// A fresh line defaults to the variant the API would pick on its own, so the
// price shown before any configuring matches what gets booked.
const newLine = (service: Service, resourceId?: number | null): CartLine => ({
  service,
  variantDuration: resolveVariant(service, null)?.durationMinutes ?? null,
  addonIds: [],
  resourceId,
})

/** "1 pozycja / 2 pozycje / 5 pozycji" - the sticky bar counts what is in the cart. */
const positionsLabel = (n: number) => {
  const last = n % 10
  const teens = n % 100
  if (n === 1) return '1 pozycja'
  if (last >= 2 && last <= 4 && (teens < 12 || teens > 14)) return `${n} pozycje`
  return `${n} pozycji`
}

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
  // isCustomerSelectable is what the business uses to keep somebody off the
  // public picker. The per-service helpers honour it, so the cart-wide list has
  // to as well - otherwise the same person is offered on one screen and hidden
  // on the next.
  const workers = useMemo(
    () => business.resources.filter((r) => r.type === 'worker' && (r as any).isCustomerSelectable !== false),
    [business],
  )

  // selection (declared here because offeringWorkers below depends on the cart;
  // the rest of the selection state follows further down).
  const initialServiceRef = useMemo(() => services.find((s) => s.id === prefill?.serviceId) ?? null, [services, prefill?.serviceId])

  // Seed the provider of a PREFILLED service (a tapped barber CTA), or settle it
  // outright when there is nothing to ask: undefined = the question stands and
  // the pick step has to be shown, null = "bez preferencji", number = pinned.
  const initialPick = useMemo<number | null | undefined>(() => {
    const svc = initialServiceRef
    if (!svc) return undefined
    // 'auto' wins over the prefill: the business decided the server assigns, so a
    // pinned worker from open({resourceId}) must never reach the payload.
    if (getItemProviderMode(svc) === 'auto') return null
    if (getItemProviderMode(svc) === 'unit') {
      const tag = ((svc.primaryObjectCategoryTag ?? '') as string).trim() || null
      const units = tag
        ? business.resources.filter(
            (r) =>
              r.type === 'object' &&
              r.isBookable !== false &&
              r.isCustomerSelectable !== false &&
              (((r.categoryTag ?? '') as string).trim() || null) === tag,
          )
        : []
      if (prefill?.resourceId && units.some((u) => u.id === prefill.resourceId)) return prefill.resourceId
      if (units.length === 0) return null
      if (units.length === 1) return units[0]!.id
      return undefined
    }
    const candidates = getResourcesForService(workers, svc)
    if (prefill?.resourceId && candidates.some((w) => w.id === prefill.resourceId)) return prefill.resourceId
    if (candidates.length === 0) return null
    if (candidates.length === 1) return candidates[0]!.id
    return undefined
  }, [initialServiceRef, workers, business, prefill?.resourceId])

  // The CART: array order = chain order (the engine books positions back to back).
  // Variant, add-ons AND the provider live PER LINE - that is the whole point of
  // the per-service mode, and the API has always accepted resourceId per item.
  const [lines, setLines] = useState<CartLine[]>(
    initialServiceRef ? [newLine(initialServiceRef, initialPick)] : [],
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
  // The step also has to exist when NOBODY covers the whole cart alone (0 shared
  // workers) or exactly one person does: "Dowolny" is a real alternative there -
  // splitting the visit usually opens up more hours than blocking the only person
  // who does everything, and with 0 shared workers it is the ONLY way. Skipping
  // the step hid that and made the "kto co wykona" explanation dead code.
  // Per-position mode is worth offering only when it would give a different
  // answer than "one person for everything" - at least two staff positions, at
  // least one with a real choice.
  const canPerItem = useMemo(() => !isUnit && canPickPerItem(lines, workers), [isUnit, lines, workers])

  const hasResourceStep = !providerAuto && (
    selectableProviders.length > 1
    || canPerItem
    || (lines.length > 1 && !isUnit && workers.length > 1)
  )
  const providerStepName = isUnit ? 'WYBÓR ZASOBU' : 'WYBÓR SPECJALISTY'
  const stepNames = hasResourceStep
    ? ['WYBÓR USŁUGI', providerStepName, 'WYBÓR TERMINU', 'TWOJE DANE']
    : ['WYBÓR USŁUGI', 'WYBÓR TERMINU', 'TWOJE DANE']
  const totalSteps = stepNames.length

  // selection
  // Per-position mode CANNOT be derived from the cart: a cart where every
  // position is still "bez preferencji" looks exactly like "Bez preferencji" for
  // everything. So the mode the customer picked is carried explicitly.
  const [eachMode, setEachMode] = useState(false)
  // The customer chose "Bez preferencji" for the whole cart. Refining WHO takes
  // the picked hour keeps this true: availability must stay union-wide (or the
  // day would shrink to that one person and the refinement would be a one-way
  // door), and the picker must stay on screen so the choice can be changed.
  const [anyChosen, setAnyChosen] = useState(initialPick === null)
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
  // { title, text } - a cap refusal and a dropped pin are different events and
  // must not share a heading. Cleared by the next composition change.
  const [cartNotice, setCartNotice] = useState<{ title: string; text: string } | null>(null)
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
      : initialServiceRef && initialPick !== undefined
        ? 2
        : initialServiceRef
          ? 1
          : 0,
  )
  // Second availability answer for an empty day, asked with every pin removed:
  // 'others' = the chosen people are busy but somebody else is free, 'none' =
  // the day itself is closed/full. Without it an empty day cannot say WHY.
  const [emptyProbe, setEmptyProbe] = useState<'others' | 'none' | null>(null)

  // flow
  const [phase, setPhase] = useState<Phase>('select')
  const [contact, setContact] = useState<Contact>(emptyContact)
  const [notes, setNotes] = useState('')
  // Status the server ACTUALLY gave the booking - 'pending' when the business
  // confirms manually (autoConfirmAppointments=false). The success screen must
  // not announce "Zarezerwowane!" for a visit that still awaits approval.
  const [bookedStatus, setBookedStatus] = useState<string | null>(null)
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
  const probedFor = useRef('')

  // The CART-WIDE answer, read back from the positions: 'any' when every one of
  // them is explicitly "bez preferencji", an id when they all carry the SAME
  // provider, null when the question is still open (or the answers differ, which
  // only per-position mode can produce).
  const cartResource: ResChoice | null = useMemo(() => {
    if (!lines.length) return null
    const first = lines[0]!.resourceId
    if (first === undefined) return null
    if (!lines.every((l) => l.resourceId === first)) return null
    return first === null ? 'any' : first
  }, [lines])
  /** The worker pinned to ONE position - the price/duration this line is booked at. */
  const lineWorker = (l: CartLine): number | undefined =>
    getItemProviderMode(l.service) === 'staff' && typeof l.resourceId === 'number' ? l.resourceId : undefined

  // Which resourceId ONE position may carry. A cart-wide pick is a WORKER, so it
  // must not land on a pool position ('unit' - the engine wants an object there
  // and answers with zero slots for the whole day) nor on a position the business
  // assigns itself ('auto'). Same rule as WEB's resolveItemResourceId.
  const itemResourceId = (l: CartLine): number | null => {
    const kind = getItemProviderMode(l.service)
    if (kind === 'auto') return null
    if (kind === 'unit') {
      const picked = typeof l.resourceId === 'number' ? business.resources.find((r) => r.id === l.resourceId) : undefined
      return picked?.type === 'object' ? picked.id : null
    }
    return typeof l.resourceId === 'number' ? l.resourceId : null
  }

  // The cart as the API wants it: array order = chain order, each position with
  // its OWN variant length, add-ons and provider, so availability and create
  // always agree on the chain shape.
  const buildCartItems = (opts?: { forAvailability?: boolean; unpinned?: boolean }): CartItem[] => lines.map((l) => ({
    businessServiceId: l.service.id,
    // Availability in "Bez preferencji" mode ignores a slot-level refinement on
    // purpose (parytet z availabilityItems w WEB); create uses the concrete pick.
    // `unpinned` is the diagnosis probe for an empty day - the same cart asked
    // without anybody pinned. In per-position mode the pins ARE the question, so
    // they are never widened silently.
    resourceId: opts?.unpinned || (opts?.forAvailability && anyChosen) ? null : itemResourceId(l),
    addonIds: l.addonIds.length ? l.addonIds : undefined,
    durationMinutes: l.variantDuration ?? undefined,
  }))

  // Stable dep for availability effects: composition, variants and add-ons all
  // change the chain length, so counts/slots must refetch when any of them move.
  // What the availability payload actually carries: in "Bez preferencji" mode the
  // pin is erased before sending, so refining WHO takes a slot must not refetch
  // the exact same body (it blanked the grid and lost focus).
  const availabilityResourceKey = anyChosen ? 'any' : lines.map((l) => itemResourceId(l) ?? 'any').join(',')
  const cartKey = lines
    .map((l) => `${l.service.id}:${l.variantDuration ?? ''}:${l.addonIds.slice().sort((a, b) => a - b).join('.')}`)
    .join('|')
  const days = useMemo(() => nextDays(HORIZON), [])
  // The cart-wide provider (worker or pool unit); undefined for "Bez preferencji",
  // per-position mode and auto.
  const pinnedResource: Resource | undefined = typeof cartResource === 'number' ? business.resources.find((r) => r.id === cartResource) : undefined
  const anyProviderLabel = isUnit ? (unitTag ? `Dowolny: ${unitTag}` : 'Dowolny') : 'Bez preferencji'
  const providerRowLabel = isUnit ? 'Zasób' : 'Specjalista'
  // Distinct people pinned across the cart, in position order - drives the
  // summary chip (one name vs an avatar stack).
  const pinnedPeople = useMemo(
    () =>
      getPinnedResourceIds(lines)
        .map((id) => business.resources.find((r) => r.id === id))
        .filter((r): r is Resource => !!r),
    [lines, business],
  )
  const someUnassigned = getStaffItems(lines).some((l) => l.resourceId == null)
  // At least one position carries a chosen SPECIALIST - so a pin can be the reason
  // a day is empty. A pool object is not a person, and "sprawdź wszystkich
  // specjalistów" would be the wrong way out of a fully booked loża.
  const anyPinned = getStaffItems(lines).some((l) => typeof l.resourceId === 'number')
  // How the visit reads in one line. A mix keeps both halves of the truth: who is
  // pinned, and that the rest is up to us.
  const providerName = (() => {
    if (!pinnedPeople.length) return anyProviderLabel
    if (pinnedPeople.length === 1 && !someUnassigned) return pinnedPeople[0]!.name
    if (pinnedPeople.length > 2) return 'Wielu specjalistów'
    return `${pinnedPeople.map((p) => p.name).join(', ')}${someUnassigned ? ' + bez preferencji' : ''}`
  })()

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
  }, [cartKey, availabilityResourceKey, refetch, auth?.userId])

  // A different cart may well have free days - forget the previous verdict.
  useEffect(() => { setNoneAhead(false) }, [cartKey, availabilityResourceKey])

  // Per-position mode stops making sense once the cart drops below two staff
  // positions: leaving it on would show a distribution with nothing to distribute.
  useEffect(() => {
    if (eachMode && !canPerItem) setEachMode(false)
  }, [eachMode, canPerItem])

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
  }, [cartKey, availabilityResourceKey, date, refetch, auth?.userId])

  // An empty day with somebody pinned has TWO possible causes, and they lead to
  // different ways out. The same cart asked once more with nobody pinned tells
  // them apart: slots => the chosen people are busy, none => the day itself is
  // shut. Skipped when nothing is pinned (the first answer already covered it).
  useEffect(() => {
    if (!lines.length || !date || loadingSlots || slots.length > 0 || anyChosen || !anyPinned) {
      setEmptyProbe(null)
      // Leaving the day drops its verdict, so the latch has to drop with it -
      // otherwise coming back to the same empty day would show the neutral
      // "no slots" state and never re-run the diagnosis.
      probedFor.current = ''
      return
    }
    // The same day can report "empty" twice in a row (stale slots while the next
    // answer is in flight) - one probe per cart+day is enough.
    const key = `${date}|${cartKey}|${availabilityResourceKey}|${refetch}`
    if (probedFor.current === key) return
    probedFor.current = key
    let cancelled = false
    getCartSlots(cfg, { date, items: buildCartItems({ unpinned: true }), bookedById: auth?.userId }).then((x) => {
      if (!cancelled) setEmptyProbe(x.slots.length ? 'others' : 'none')
    })
    return () => {
      cancelled = true
    }
  }, [cartKey, availabilityResourceKey, date, slots, loadingSlots, refetch, auth?.userId])

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
  // add-ons + any per-employee override for the worker pinned to THAT position.
  // When nothing pins the price yet (no worker, no variant), fall back to the
  // "od {min}" range across the offering workers.
  // Cart totals: every position priced at its own pinned worker's rate (or its
  // base), summed. One position still priced as a range makes the whole total a
  // range, so "od" propagates up - jak w kreatorze WEB.
  const cartTotals = lines.reduce(
    (acc, l) => {
      const t = configuredTotals(l.service, l.variantDuration, l.addonIds, lineWorker(l))
      return { price: acc.price + t.price, duration: acc.duration + t.duration }
    },
    { price: 0, duration: 0 },
  )
  const lineIsRange = (l: CartLine) => {
    if (lineWorker(l)) return false
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
    const base = variant?.priceCents ?? (lineIsRange(l) ? r.min : configuredTotals(l.service, l.variantDuration, [], lineWorker(l)).price)
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
          // Per-position mode: the row has to say who takes THIS service, or the
          // summary would flatten a mixed cart back into one anonymous answer.
          const who = eachMode && getItemProviderMode(l.service) === 'staff'
            ? business.resources.find((r) => r.id === l.resourceId)?.name ?? 'bez preferencji'
            : null
          return {
            label: l.service.name,
            value: [
              ...(extras.length ? [extras.join(' · ')] : [formatDuration(configuredTotals(l.service, l.variantDuration, l.addonIds, lineWorker(l)).duration)]),
              ...(who ? [`u: ${who}`] : []),
            ].join(' · '),
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
      selectedId: typeof line.resourceId === 'number' ? line.resourceId : null,
      onPick: (id: number | null) => {
        // Keep the slot: the person came FROM this slot's free list, and
        // anyChosen stays up so availability is not narrowed behind the choice.
        setLines((prev) => setAllItemResources(prev, id))
        if (id != null) emit('specialist_selected', { ...resourceEvent(id), atSlot: true })
      },
    }
  }, [lines, anyChosen, isUnit, providerAuto, slotKey, chain, workers])

  /** Drop a slot-scoped specialist pick, back to cart-wide "Bez preferencji". */
  function clearSlotPin() {
    if (anyChosen && lines.some((l) => typeof l.resourceId === 'number')) {
      setLines((prev) => setAllItemResources(prev, null))
    }
  }

  async function findNextFree() {
    if (!lines.length || findingNext) return
    setFindingNext(true)
    // The sweep is slow (60 days server-side); if the cart changed meanwhile, the
    // answer describes a visit that no longer exists - drop it.
    const forCart = cartKey
    const hit = await getCartFirstFree(cfg, { items: buildCartItems({ forAvailability: true }), from: date || undefined, bookedById: auth?.userId })
    setFindingNext(false)
    if (forCart !== cartKey) return
    if (hit === 'error') return
    if (hit) {
      setDate(hit.date)
      setSlotKey('')
      clearSlotPin()
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
      setBookedStatus(r.data?.status ?? null)
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
      {
        businessServiceId: service.id,
        // "Bez preferencji" signs up for ANY specialist - a pin made for one hour
        // must not narrow a sign-up that is about the service being free at all.
        resourceId: anyChosen ? null : lineWorker(waitlistLine!) ?? null,
        dateFrom,
        dateTo,
        timeFrom: prefs.timeFrom,
        timeTo: prefs.timeTo,
        bookedById: a.userId,
        // Without it the entry is attributed to the client app - the widget is a
        // website sign-up.
        source: 'web',
      },
      a.token,
    )
    setWlBusy(false)
    if (r.ok) {
      setPhase('waitlistDone')
      emit('waitlist_joined', {
        serviceId: service.id,
        serviceName: service.name,
        ...resourceEvent(cartResource ?? 'any'),
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
    emit('waitlist_started', { serviceId: waitlistLine?.service.id, ...resourceEvent(cartResource ?? 'any'), date })
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
    ...resourceEvent(cartResource ?? 'any'),
    date,
    time: key ? slotLabel(date, key, business.timezone) : '',
    startDate: key ? slotStartDate(date, key) : '',
  })

  // ---- selection (select-then-Dalej) ----
  /**
   * Toggle a service in the cart. A new position inherits the cart-wide answer,
   * but a pinned person who does not perform it loses the pin (jak
   * applyToggleService w WEB) - the chain would dead-end at the time step.
   */
  function toggleService(s: Service) {
    setCartNotice(null)
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
      setCartNotice({ title: 'Limit koszyka', text: `W jednej wizycie możesz połączyć maksymalnie ${MAX_CART_ITEMS} usług.` })
      return
    }
    // Per-position mode never inherits a person onto a service the customer has
    // not looked at yet - "bez preferencji" is the honest default there.
    const inherited = eachMode ? null : typeof cartResource === 'number' ? cartResource : cartResource === 'any' ? null : undefined
    const next = [...lines, newLine(s, inherited)]
    const pickedObject = typeof inherited === 'number'
      ? business.resources.find((r) => r.id === inherited && r.type === 'object')
      : undefined
    if (pickedObject) {
      // A pool object stays valid while EVERY position is a unit service of the
      // same pool - adding a second loża must not discard the picked loża.
      const poolTag = ((pickedObject.categoryTag ?? '') as string).trim() || null
      const stillValid = next.every((l) => l.service.fulfillmentMode === 'unit'
        && (((l.service.primaryObjectCategoryTag ?? '') as string).trim() || null) === poolTag)
      setLines(stillValid ? next : next.map((l) => ({ ...l, resourceId: undefined })))
      if (!stillValid) {
        setAnyChosen(false)
        setCartNotice({
          title: 'Zmienił się skład wizyty',
          text: `${pickedObject.name} nie obsługuje usługi: ${s.name}. Wybierz zasób ponownie.`,
        })
      }
    } else {
      const { items, droppedResourceIds } = dropInvalidPins(next, eachMode ? 'each' : 'single')
      setLines(items)
      if (droppedResourceIds.length) {
        const dropped = droppedResourceIds
          .map((id) => business.resources.find((r) => r.id === id)?.name)
          .filter((n): n is string => !!n)
        if (!eachMode) setAnyChosen(false)
        setCartNotice({
          title: 'Zmienił się skład wizyty',
          // Nazwa usługi po dwukropku - wstawiona w zdanie nie da się odmienić
          // ("nie wykonuje usługi Strzyżenie" zgrzyta po polsku).
          text: dropped.length
            ? `${dropped.join(', ')} nie wykonuje usługi: ${s.name}. Wybierz specjalistę ponownie.`
            : 'Wybierz specjalistę ponownie - zmienił się skład wizyty.',
        })
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

  /** One answer for the WHOLE cart: "Bez preferencji" or one person/object. */
  function pickResource(r: ResChoice) {
    if (r === cartResource && !eachMode) return
    setLines((prev) => setAllItemResources(prev, r === 'any' ? null : r))
    setEachMode(false)
    setAnyChosen(r === 'any')
    setCartNotice(null)
    setDate('')
    setSlotKey('')
    emit('specialist_selected', resourceEvent(r))
  }

  /** Switch to one answer PER position; untouched ones default to "bez preferencji". */
  function pickPerItemMode() {
    setLines((prev) => enterPerItemMode(prev))
    setEachMode(true)
    // The pins are the question now, so availability must follow them (no union).
    setAnyChosen(false)
    setCartNotice(null)
    setDate('')
    setSlotKey('')
    emit('specialist_selected', { resourceId: null, resourceName: 'Wybór per usługa', perService: true })
  }

  /** The answer for ONE position (per-position mode, or the chip on the time step). */
  function pickItemResource(serviceId: number, id: number | null) {
    const next = setItemResource(lines, serviceId, id)
    setLines(next)
    // Answering per position IS the per-position mode. Editing from the chip on
    // the time step used to leave eachMode off, so going back to the specialist
    // step showed the cart-wide list with nothing selected and "Dalej" blocked -
    // the mixed answers were silently unreachable.
    if (getStaffItems(next).length >= 2) setEachMode(true)
    // Union-wide availability only survives while nothing at all is pinned -
    // otherwise the calendar would answer a question nobody asked.
    setAnyChosen(getStaffItems(next).every((l) => l.resourceId == null))
    setCartNotice(null)
    setSlotKey('')
    emit('specialist_selected', { ...resourceEvent(id ?? 'any'), serviceId, perService: true })
  }

  /** "Sprawdź wszystkich specjalistów" - unpin everybody and ask the day again. */
  function checkAllSpecialists() {
    const next = clearStaffPins(lines)
    setLines(next)
    setAnyChosen(next.every((l) => itemResourceId(l) == null))
    setSlotKey('')
    setEmptyProbe(null)
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
        const r: ResChoice = !providerAuto && selectableProviders.length === 1 ? selectableProviders[0]!.id : 'any'
        setLines((prev) => setAllItemResources(prev, r === 'any' ? null : r))
        setEachMode(false)
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
    clearSlotPin()
    setSlotKey('')
    setSlots([])
    setBookingErr('')
    setRefetch((x) => x + 1)
    setSelStep(2)
    setPhase('select')
  }
  function restart() {
    setLines([])
    setEachMode(false)
    setAnyChosen(false)
    setEmptyProbe(null)
    setConfiguringId(null)
    setCartNotice(null)
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
  // The provider question is answered when every position carries an answer: in
  // per-position mode each staff line has one (a person or "bez preferencji"),
  // otherwise the whole cart shares one - and a pinned provider must still belong
  // to the current selectable set, or a stale id from a previous composition
  // would enable "Dalej".
  const resourceValid = eachMode
    ? getStaffItems(lines).every((l) => l.resourceId !== undefined)
    : cartResource === 'any' || (typeof cartResource === 'number' && selectableProviders.some((p) => p.id === cartResource))
  // Every position must satisfy its own add-on groups before the cart can move on.
  const cartValid = lines.length > 0 && !configuring && lines.every((l) => addonsValid(l.service, l.addonIds))
  const canAdvance = selStep === 0 ? cartValid : selStep === 1 ? resourceValid : !!slotKey
  const ctaPrice = lines.length ? `${showFrom ? 'od ' : ''}${formatPrice2(shownPrice)}` : ''
  // The time step has to show who the hours belong to - and let it be changed
  // without walking back a step. A pool cart keeps its own (single) answer.
  const showProviderChip = lines.length > 0 && !isUnit && !providerAuto && (hasResourceStep || pinnedPeople.length > 0)
  const canEditProviders = getStaffItems(lines).some((l) => getResourcesForService(workers, l.service).length > 0)

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

        {/* 'done' included on purpose: the test-mode disclaimer must survive onto
            the success screen - that's the moment the customer decides whether
            the booking is real. */}
        {business.isTestMode && (phase === 'select' || phase === 'identify' || phase === 'waitlist' || phase === 'done') && (
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
            workerId={lineWorker(configuringLine)}
            onPickVariant={pickVariant}
            onToggleAddon={toggleAddon}
            onDone={confirmConfigure}
          />
        )}
        {phase === 'select' && !configuring && selStep === 0 && (
          <>
            {cartNotice && <Notice title={cartNotice.title}>{cartNotice.text}</Notice>}
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
            workers={workers}
            mode={isUnit ? 'unit' : 'staff'}
            anyLabel={anyProviderLabel}
            selected={cartResource}
            perItem={eachMode}
            canPerItem={canPerItem}
            onPick={pickResource}
            onPickPerItem={pickPerItemMode}
            onPickItemResource={pickItemResource}
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
            onPickDate={(d) => { setDate(d); setSlotKey(''); clearSlotPin() }}
            onPickSlot={(key) => {
              // A refinement belongs to the hour it was made at: the pinned person
              // may simply be busy at the new one, while availability stayed
              // union-wide. Keeping it would send create after someone the slot
              // list never claimed was free.
              clearSlotPin()
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
            providerChip={showProviderChip ? {
              label: providerName,
              people: pinnedPeople.map((p) => ({ name: p.name, image: p.image })),
              editor: canEditProviders
                ? <ItemProviders items={lines} workers={workers} onPick={pickItemResource} />
                : undefined,
            } : undefined}
            emptyReason={emptyProbe === 'others' ? 'busy' : undefined}
            onCheckAll={checkAllSpecialists}
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
              checkWaitlistWindow(cfg, { businessServiceId: waitlistLine.service.id, resourceId: anyChosen ? null : lineWorker(waitlistLine) ?? null, ...win })
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
            // Terms belong to a booking; a waitlist sign-up and an access-check
            // login are not the moment to state a cancellation window.
            policy={intent === 'book' && slotKey ? business.bookingPolicy : undefined}
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
          <StepDone rows={summaryRows} status={bookedStatus} phone={contact.phone} email={contact.email} onClose={onClose} onRestart={restart} />
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
                  <div class="vz-cta-svc">{lines.map((l) => l.service.name).join(', ')}</div>
                  <div class="vz-cta-meta">
                    <b>{ctaPrice}</b> · {positionsLabel(lines.length)} · {formatDuration(shownDuration)}
                  </div>
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
            {selStep >= 1 && (eachMode || cartResource != null) && (
              <div class="vz-cta-who">
                {pinnedResource && !eachMode ? (
                  <span class="vz-card-av">{pinnedResource.image ? <img src={pinnedResource.image} alt="" /> : pinnedResource.name.charAt(0)}</span>
                ) : (
                  <AvatarStack people={pinnedPeople.map((p) => ({ name: p.name, image: p.image }))} max={2} />
                )}
                <span>{providerName}</span>
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
