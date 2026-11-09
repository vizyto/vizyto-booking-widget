// Loyalty rewards in the booking flow (vizyto #471 F37): the pure rules and the
// copy of the "Nagroda" step and of the program block on the success screen.
//
// A local twin of these files in the Vizyto monorepo, which the widget cannot
// import (it is built and released on its own, same stance as ./tables):
//  - packages/shared/src/utils/loyalty/bookingRewards.ts (the per-line reward
//    rule, ported verbatim: bookingRewardLines, bookingRewardLineEligibility,
//    bookingRewardBase, judgeBookingReward, bookingCatalogCost),
//  - packages/shared/src/components/loyalty/booking/BookingRewardProvider.tsx
//    (usable, blocked and claimable rewards, the create-error recovery) and
//    BookingRewardChoice.tsx (the notes and the blocked reasons),
//  - packages/shared/src/components/loyalty/booking/personalPricing.ts
//    (amountDueSentence),
//  - packages/shared/src/utils/loyalty/customerLabels.ts (earn rules, validity,
//    stamp rules, claim errors),
//  - apps/web/src/components/loyalty/booking/BookingRewardAdapters.tsx (the
//    target key of every quote line, the WEB wording of a kept reward) and
//    apps/web/src/components/pages/business/sections/LoyaltyProgram.tsx (the
//    program intro and the customer's progress).
// Keep the two in step. Free of preact, fetch and DOM code, so
// tests/loyalty.test.js imports it directly.

import type {
  LoyaltyCatalogReward,
  LoyaltyEarnRule,
  LoyaltyPriceSnapshot,
  LoyaltyProgramPublic,
  LoyaltyRewardKind,
  LoyaltyRewardTerms,
  LoyaltyTarget,
  LoyaltyWallet,
  MyLoyaltyReward,
  PriceQuote,
  PriceQuoteLine,
  RewardLineEligibility,
  RewardQuoteResult,
} from './api'
import { formatPrice2, priceLabel } from './api'

/** The booking's kind, as the shared reward choice names it. */
export type RewardFlow = 'appointment' | 'class' | 'rental'

// ---------------------------------------------------------------------------
// Target keys
// ---------------------------------------------------------------------------

const TARGET_FIELD: Record<LoyaltyTarget['kind'], keyof LoyaltyTarget> = {
  service: 'businessServiceId',
  service_variant: 'businessServiceId',
  group_class_entry: 'groupClassId',
  enrollment_option: 'enrollmentOptionId',
  rental_type: 'rentalTypeId',
  rental_resource: 'resourceId',
  addon: 'addonId',
}

/**
 * "service:12", "service_variant:12:45", "addon:5": the key the API gives a quote
 * position and a reward target. Null for a target that lacks the id its kind needs.
 */
export function promotionPositionKey(target: LoyaltyTarget): string | null {
  const id = target[TARGET_FIELD[target.kind]]
  if (id == null) return null
  if (target.kind === 'service_variant') {
    if (target.variantMinutes == null) return null
    return `${target.kind}:${id}:${target.variantMinutes}`
  }
  return `${target.kind}:${id}`
}

/** One visit position as the widget's cart holds it, enough to key its quote lines. */
export type RewardCartItem = {
  businessServiceId: number
  /** The length preset the API books (chosen, or the shortest by default); null without presets. */
  variantMinutes: number | null
  addons: Array<{ id: number; name: string }>
}

/**
 * Visit lines in quote order: each service (`service_variant` when the API books
 * a length preset), then its add-ons, matched by name because the quote names them
 * and only the cart knows their ids. Mirrors the API's `cartRewardLines`
 * (appointments/services/price-quote.service.ts) and the WEB adapter.
 */
export function appointmentTargetKeys(items: readonly RewardCartItem[], lines: readonly Pick<PriceQuoteLine, 'kind' | 'name'>[]): Array<string | null> {
  const keys: Array<string | null> = lines.map(() => null)
  let cursor = 0
  for (const item of items) {
    if (lines[cursor]?.kind === 'service') {
      keys[cursor] = promotionPositionKey(item.variantMinutes != null
        ? { kind: 'service_variant', businessServiceId: item.businessServiceId, variantMinutes: item.variantMinutes }
        : { kind: 'service', businessServiceId: item.businessServiceId })
      cursor++
    }
    const pending = [...item.addons]
    while (lines[cursor]?.kind === 'addon') {
      const at = pending.findIndex((addon) => addon.name === lines[cursor]!.name)
      if (at >= 0) {
        keys[cursor] = promotionPositionKey({ kind: 'addon', addonId: pending[at]!.id })
        pending.splice(at, 1)
      }
      cursor++
    }
  }
  return keys
}

/**
 * The base line of a rental: keyed by the type when its units are pooled
 * (`pool`, `choice`), else by the unit, exactly as the API keys it
 * (rentals/services/reward-pricing.service.ts). An exposure the payload leaves
 * out counts as `unit`, as in the widget's offer grouping.
 */
export function rentalBaseKey(head: { id: number; rentalTypeId?: number | null; rentalUnitExposure?: string | null }): string {
  const exposure = head.rentalUnitExposure ?? 'unit'
  return head.rentalTypeId != null && exposure !== 'unit'
    ? `rental_type:${head.rentalTypeId}`
    : `rental_resource:${head.id}`
}

/** The one line of a class entry. */
export const classEntryKey = (groupClassId: number) => `group_class_entry:${groupClassId}`

// ---------------------------------------------------------------------------
// The per-line rule (shared bookingRewards.ts, verbatim)
// ---------------------------------------------------------------------------

/** One line of the ordinary quote, with the target key the API gives the same position. */
export type BookingRewardLine = {
  /** Zero-based position in the quote's `lines`. */
  index: number
  name: string
  targetKey: string | null
  price: number | null
  promotionId: number | null
  listPrice: number | null
  loyalty?: LoyaltyPriceSnapshot | null
}

/** What a claimed reward (frozen `termsSnapshot`) and a catalog entry have in common. */
export type BookingRewardTerms = {
  kind: LoyaltyRewardKind
  scope: 'all' | 'selected'
  targets: Array<LoyaltyTarget & { targetKey?: string | null }>
  selectedTargetKey?: string | null
  stacksWithPromotions?: boolean
  minimumTotalGrosze: number | null
  onSiteOnly: boolean
}

/** The quote's lines in the shape above, with one target key per line (null = the line has none). */
export function bookingRewardLines(lines: readonly PriceQuoteLine[], targetKeys: ReadonlyArray<string | null>): BookingRewardLine[] {
  return lines.map((line, index) => ({
    index,
    name: line.name,
    targetKey: targetKeys[index] ?? null,
    price: line.price,
    promotionId: line.promotionId,
    listPrice: line.listPrice,
    loyalty: line.loyalty ?? null,
  }))
}

const targetKeysOf = (terms: BookingRewardTerms) =>
  new Set(terms.targets.map((target) => (typeof target.targetKey === 'string' ? target.targetKey : promotionPositionKey(target))))

/** The API's per-line rule: a price, the reward's scope, then the D29 promotion switch. */
export function bookingRewardLineEligibility(terms: BookingRewardTerms, line: BookingRewardLine): RewardLineEligibility {
  if (line.price == null) return { eligible: false, reason: 'price_unavailable' }
  const outside = (terms.scope === 'selected' && (!line.targetKey || !targetKeysOf(terms).has(line.targetKey)))
    || (terms.selectedTargetKey != null && terms.selectedTargetKey !== line.targetKey)
  if (outside) return { eligible: false, reason: 'outside_reward_scope' }
  if (line.promotionId != null && terms.kind !== 'free_item' && !(terms.stacksWithPromotions ?? false)) {
    return { eligible: false, reason: 'promotion_not_stackable' }
  }
  return { eligible: true, reason: null }
}

/** The base the API checks a reward minimum against (D29e): P when the reward stacks, else max(B, C). */
export function bookingRewardBase(terms: BookingRewardTerms, line: BookingRewardLine): number {
  const price = line.price ?? 0
  const base = line.loyalty?.basePrice ?? line.listPrice ?? price
  const adjustment = line.loyalty?.adjustmentPrice ?? line.listPrice ?? price
  const promotion = line.promotionId == null ? null : line.loyalty?.promotionPrice ?? price
  return terms.kind !== 'free_item' && promotion != null ? promotion : Math.max(base, adjustment)
}

export type UsableVerdict = { kind: 'usable'; lineIndexes: number[]; excluded: BookingRewardLine[]; targetKey: string | null }
export type BookingRewardVerdict =
  /** `lineIndexes` go to `rewardSelection`; `excluded` are promoted lines this reward skips. */
  | UsableVerdict
  /** `promotion`: every line it covers is promoted and it does not stack; `minimum`: below its minimum. */
  | { kind: 'blocked'; reason: 'promotion' | 'minimum'; lines: BookingRewardLine[] }

/**
 * What one reward can do on this booking. null = it covers no line here (another
 * service), so the step leaves it out. `extraExcluded` are line indexes the API
 * refused in an earlier answer (409 REWARD_DISCOUNT_CONFLICT with
 * `details.lineIndexes`), kept out of the next try. A free item takes exactly one
 * line: the first one it covers, like the PRO settlement.
 */
export function judgeBookingReward(
  terms: BookingRewardTerms,
  lines: readonly BookingRewardLine[],
  extraExcluded: readonly number[] = [],
): BookingRewardVerdict | null {
  if (terms.onSiteOnly) return null
  const judged = lines.map((line) => ({
    line,
    verdict: extraExcluded.includes(line.index)
      ? { eligible: false, reason: 'promotion_not_stackable' as const }
      : bookingRewardLineEligibility(terms, line),
  }))
  const promoted = judged.filter((item) => item.verdict.reason === 'promotion_not_stackable').map((item) => item.line)
  const eligible = judged.filter((item) => item.verdict.eligible).map((item) => item.line)
  if (!eligible.length) return promoted.length ? { kind: 'blocked', reason: 'promotion', lines: promoted } : null
  const selected = terms.kind === 'free_item' ? eligible.slice(0, 1) : eligible
  if (terms.minimumTotalGrosze != null && selected.reduce((sum, line) => sum + bookingRewardBase(terms, line), 0) < terms.minimumTotalGrosze) {
    return { kind: 'blocked', reason: 'minimum', lines: selected }
  }
  return {
    kind: 'usable',
    lineIndexes: selected.map((line) => line.index),
    excluded: terms.kind === 'free_item' ? [] : promoted,
    targetKey: terms.kind === 'free_item' ? selected[0]!.targetKey : null,
  }
}

/**
 * Points a catalog entry costs for this booking: a free item's position may carry
 * its own cost (`pointsCostOverride`). A range-cost entry is claimed at its lowest
 * cost, as in the wallet.
 */
export function bookingCatalogCost(
  reward: { kind: LoyaltyRewardKind; pointsCostMin: number; targets: Array<{ targetKey?: string | null; pointsCostOverride?: number | null }> },
  targetKey: string | null,
): number {
  if (reward.kind !== 'free_item') return reward.pointsCostMin
  const target = reward.targets.find((item) => item.targetKey === targetKey)
  return target?.pointsCostOverride ?? reward.pointsCostMin
}

// ---------------------------------------------------------------------------
// Which rewards this booking offers (shared BookingRewardProvider)
// ---------------------------------------------------------------------------

/** An available reward whose effective expiry has passed waits for the expiry job: show it as lapsed. */
export const rewardLapsed = (reward: Pick<MyLoyaltyReward, 'status' | 'expiresAt'>, now = Date.now()) =>
  reward.status === 'available' && reward.expiresAt != null && new Date(reward.expiresAt).getTime() <= now

/**
 * The customer's rewards a booking may offer: available, not lapsed, and not
 * on-site only (staff use those at the business; a customer quote answers 409).
 */
export const usableOwned = (rewards: readonly MyLoyaltyReward[], now = Date.now()) =>
  rewards.filter((reward) => reward.status === 'available' && !rewardLapsed(reward, now) && !reward.termsSnapshot.onSiteOnly)

export type ClaimableReward = { catalog: LoyaltyCatalogReward; cost: number; targetKey: string | null }

/** Catalog entries the balance pays for and this booking can take, unless one is already owned. */
export function claimable(
  catalog: readonly LoyaltyCatalogReward[],
  owned: readonly Pick<MyLoyaltyReward, 'catalogId'>[],
  wallet: Pick<LoyaltyWallet, 'balance'> | null,
  lines: readonly BookingRewardLine[],
): ClaimableReward[] {
  if (!wallet || !lines.length) return []
  const ownedCatalogs = new Set(owned.map((reward) => reward.catalogId))
  return catalog.flatMap((entry) => {
    if (entry.onSiteOnly || ownedCatalogs.has(entry.id)) return []
    const verdict = judgeBookingReward(entry, lines)
    if (verdict?.kind !== 'usable') return []
    const cost = bookingCatalogCost(entry, verdict.targetKey)
    return cost <= wallet.balance ? [{ catalog: entry, cost, targetKey: verdict.targetKey }] : []
  })
}

/** A reward whose server price is not lower than today's price gains the customer nothing here. */
export const noSaving = (rewardTotal: number | null | undefined, ordinaryTotal: number | null | undefined) =>
  rewardTotal != null && ordinaryTotal != null && rewardTotal >= ordinaryTotal

/** The server's answer for one reward, tied to the lines it was asked for. */
export type RewardQuoteState =
  | { status: 'loading'; key: string }
  | { status: 'ok'; key: string; quote: PriceQuote }
  | { status: 'error'; key: string; code: string; lineIndexes?: number[] }

/** The selection a quote belongs to: a different line set is a different question. */
export const selectionKey = (lineIndexes: readonly number[]) => lineIndexes.join(',')

export type UsableReward = { reward: MyLoyaltyReward; verdict: UsableVerdict; quote: RewardQuoteState | null }
export type BlockedReward = {
  reward: MyLoyaltyReward
  /**
   * `unavailable`: the server refused it for this booking without a line reason;
   * `no_saving`: its server price is not lower than the price without a reward.
   */
  reason: 'promotion' | 'minimum' | 'unavailable' | 'no_saving'
  lines: BookingRewardLine[]
}

/** Codes that refuse a whole reward on this booking. */
const UNAVAILABLE_CODES: ReadonlySet<string> = new Set(['REWARD_UNAVAILABLE', 'LOYALTY_PROGRAM_PAUSED', 'LOYALTY_PLAN_REQUIRED'])

export type RewardChoiceInput = {
  owned: readonly MyLoyaltyReward[]
  catalog: readonly LoyaltyCatalogReward[]
  wallet: Pick<LoyaltyWallet, 'balance'> | null
  lines: readonly BookingRewardLine[]
  ordinaryTotal: number | null
  /** Lines the server refused per reward (409 REWARD_DISCOUNT_CONFLICT). */
  refused: Readonly<Record<number, readonly number[]>>
  quotes: Readonly<Record<number, RewardQuoteState>>
  now?: number
}

export type RewardChoice = {
  usable: UsableReward[]
  blocked: BlockedReward[]
  claimable: ClaimableReward[]
  /** Usable rewards without an answer for their current lines: price these. */
  toPrice: Array<{ rewardId: number; lineIndexes: number[] }>
}

/**
 * The step's three lists, from the customer's rewards, the catalog, the ordinary
 * lines and the server's answers so far. Same split as the shared provider:
 * a refusal of the whole reward and "no saving" move it to the blocked list, a
 * remaining line conflict drops it, and every other failure keeps it on the list
 * with a retry.
 */
export function deriveRewardChoice(input: RewardChoiceInput): RewardChoice {
  const owned = usableOwned(input.owned, input.now)
  const usable: UsableReward[] = []
  const blocked: BlockedReward[] = []
  const toPrice: RewardChoice['toPrice'] = []
  for (const reward of owned) {
    const verdict = judgeBookingReward(reward.termsSnapshot, input.lines, input.refused[reward.id] ?? [])
    if (!verdict) continue
    if (verdict.kind === 'blocked') {
      blocked.push({ reward, reason: verdict.reason, lines: verdict.lines })
      continue
    }
    const known = input.quotes[reward.id]
    const quote = known && known.key === selectionKey(verdict.lineIndexes) ? known : null
    if (!quote) {
      toPrice.push({ rewardId: reward.id, lineIndexes: verdict.lineIndexes })
      usable.push({ reward, verdict, quote: null })
      continue
    }
    if (quote.status === 'error' && UNAVAILABLE_CODES.has(quote.code)) {
      blocked.push({ reward, reason: 'unavailable', lines: [] })
      continue
    }
    if (quote.status === 'error' && quote.code === 'REWARD_DISCOUNT_CONFLICT') continue
    if (quote.status === 'ok' && noSaving(quote.quote.total, input.ordinaryTotal)) {
      blocked.push({ reward, reason: 'no_saving', lines: [] })
      continue
    }
    usable.push({ reward, verdict, quote })
  }
  // The shared order: line blocks first, then the server's refusals, then no saving.
  const order: Record<BlockedReward['reason'], number> = { promotion: 0, minimum: 0, unavailable: 1, no_saving: 2 }
  blocked.sort((a, b) => order[a.reason] - order[b.reason])
  return { usable, blocked, claimable: claimable(input.catalog, owned, input.wallet, input.lines), toPrice }
}

/**
 * Folds one round of reward quotes into the state. A line conflict with lines not
 * refused yet adds them to the reward's refused set (its verdict then changes and
 * it is priced again without them); a conflict that names nothing new stays as
 * the answer, which drops the reward. A quote without a token cannot be booked,
 * so it counts as a failure.
 */
export function applyRewardQuotes(
  state: { refused: Readonly<Record<number, readonly number[]>>; quotes: Readonly<Record<number, RewardQuoteState>> },
  asked: ReadonlyArray<{ rewardId: number; lineIndexes: number[] }>,
  results: readonly RewardQuoteResult[],
): { refused: Record<number, number[]>; quotes: Record<number, RewardQuoteState> } {
  const refused: Record<number, number[]> = Object.fromEntries(Object.entries(state.refused).map(([id, list]) => [id, [...list]]))
  const quotes: Record<number, RewardQuoteState> = { ...state.quotes }
  asked.forEach(({ rewardId, lineIndexes }, i) => {
    const result = results[i]
    const key = selectionKey(lineIndexes)
    if (!result) return
    if (result.ok) {
      quotes[rewardId] = result.quote.pricingToken
        ? { status: 'ok', key, quote: result.quote }
        : { status: 'error', key, code: 'NO_PRICING_TOKEN' }
      return
    }
    const known = refused[rewardId] ?? []
    const fresh = result.code === 'REWARD_DISCOUNT_CONFLICT' ? (result.lineIndexes ?? []).filter((index) => !known.includes(index)) : []
    if (fresh.length) {
      refused[rewardId] = [...known, ...fresh]
      delete quotes[rewardId]
      return
    }
    quotes[rewardId] = { status: 'error', key, code: result.code, ...(result.lineIndexes ? { lineIndexes: result.lineIndexes } : {}) }
  })
  return { refused, quotes }
}

/** A refused line joins the reward's refused set (a create-time conflict). */
export function refuseLines(refused: Readonly<Record<number, readonly number[]>>, rewardId: number, lineIndexes: readonly number[]): Record<number, number[]> {
  const next: Record<number, number[]> = Object.fromEntries(Object.entries(refused).map(([id, list]) => [id, [...list]]))
  next[rewardId] = [...new Set([...(next[rewardId] ?? []), ...lineIndexes])]
  return next
}

/** The booking's idempotency key with the chosen reward folded in, as CLIENT and WEB do. */
export const withRewardKey = (key: string, rewardId: number | null | undefined) =>
  rewardId != null ? `${key}-r${rewardId}` : key

/**
 * `expectedTotal` of a create. A reward always sends its quote's total (null
 * included: the API refuses a reward without the field, 422
 * REWARD_EXPECTED_TOTAL_REQUIRED); an ordinary booking sends a known total only,
 * exactly as before loyalty.
 */
export function expectedTotalOf(pricing: Pick<PriceQuote, 'total'> | null | undefined, reward: object | null | undefined): { expectedTotal?: number | null } {
  if (reward) return { expectedTotal: pricing?.total ?? null }
  return pricing?.total != null ? { expectedTotal: pricing.total } : {}
}

/**
 * The class entry's `expectedTotal`: without a reward the term's promotion price
 * stands in for a missing quote, exactly as before loyalty.
 */
export function classExpectedTotalOf(
  pricing: Pick<PriceQuote, 'total'> | null | undefined,
  promoPrice: number | null | undefined,
  reward: object | null | undefined,
): { expectedTotal?: number | null } {
  if (reward) return expectedTotalOf(pricing, reward)
  const total = pricing?.total ?? promoPrice
  return total != null ? { expectedTotal: total } : {}
}

// ---------------------------------------------------------------------------
// Create errors
// ---------------------------------------------------------------------------

/**
 * How a create with a reward recovers, decided BEFORE the ordinary failure
 * classification (which would read every one of these as a lost slot):
 *  - `fresh_quote`: the token lived out or a price moved, and the answer carries a
 *    fresh reward quote: book again with it (silently when the total is the same),
 *  - `price_changed`: a price moved and there is no reward quote: back to the
 *    choice at the new ordinary price,
 *  - `conflict`: a chosen line is in a promotion now (REWARD_DISCOUNT_CONFLICT),
 *  - `unavailable`: the reward was used elsewhere, expired or the token cannot be
 *    renewed,
 *  - `refusal`: the program cannot give a reward now (paused, plan, outdated app),
 *  - null: not a reward matter; the ordinary handling takes it.
 */
export type RewardCreateAction = 'fresh_quote' | 'price_changed' | 'conflict' | 'unavailable' | 'refusal'

export function rewardCreateAction(code: string, hasRewardPricing: boolean): RewardCreateAction | null {
  if ((code === 'REWARD_QUOTE_EXPIRED' || code === 'PRICE_CHANGED') && hasRewardPricing) return 'fresh_quote'
  if (code === 'PRICE_CHANGED') return 'price_changed'
  if (code === 'REWARD_DISCOUNT_CONFLICT') return 'conflict'
  if (code === 'REWARD_UNAVAILABLE' || code === 'REWARD_QUOTE_EXPIRED') return 'unavailable'
  if (code === 'LOYALTY_PROGRAM_PAUSED' || code === 'LOYALTY_PLAN_REQUIRED' || code === 'REWARD_EXPECTED_TOTAL_REQUIRED') return 'refusal'
  return null
}

/** A quote the create can rebook with: it carries the reward and a fresh token. */
export const hasRewardPricing = (pricing: PriceQuote | null | undefined): pricing is PriceQuote & { pricingToken: string } =>
  !!pricing?.reward && typeof pricing.pricingToken === 'string'

/** The notices of the recovery, in the shared provider's words (WEB host). */
export const REWARD_RECOVERY = {
  repriced: { title: 'Zmieniła się cena z nagrodą', text: 'Odświeżyliśmy wycenę.' },
  priceChanged: { title: 'Cena się zmieniła', text: 'Wróciliśmy do ceny bez nagrody. Sprawdź podsumowanie i wybierz nagrodę ponownie.' },
  conflict: { title: 'Ta nagroda nie łączy się z promocją', text: 'Ta pozycja jest teraz w promocji. Wróciliśmy do ceny bez nagrody. Sprawdź cenę i potwierdź rezerwację.' },
  unavailable: { title: 'Ta nagroda jest już niedostępna', text: 'Mogła zostać użyta w innej rezerwacji. Wróciliśmy do ceny bez nagrody. Sprawdź cenę i potwierdź rezerwację.' },
} as const

/** A program that cannot give a reward now, when the API has no sentence of its own. */
export const FIXED_REFUSAL = 'Nie możesz teraz użyć nagrody. Zarezerwuj bez niej albo spróbuj później.'

/** The API's own sentence for a refused reward (the WEB host), else the fixed one. */
export const refusalMessage = (message: string | null | undefined, code: string) =>
  typeof message === 'string' && message && message !== code ? message : FIXED_REFUSAL

/** API codes whose own Polish message is written for the customer. */
const OWN_MESSAGE = /^(LOYALTY_|REWARD_|INSUFFICIENT_POINTS)/
export const CLAIM_FALLBACK = 'Nie udało się odebrać nagrody. Spróbuj ponownie.'

/** A failed claim as one sentence (shared loyaltyErrorMessage). */
export function claimErrorMessage(code: string, message?: string | null, fallback = CLAIM_FALLBACK): string {
  if (code === 'IDEMPOTENCY_CONFLICT') return 'Ta nagroda została już odebrana.'
  if (code === 'REWARD_UNAVAILABLE') return 'Tej nagrody nie można teraz odebrać. Lista nagród została odświeżona.'
  if (OWN_MESSAGE.test(code) && typeof message === 'string' && message && message !== code) return message
  if (code === 'NETWORK') return 'Brak połączenia. Spróbuj ponownie.'
  return fallback
}

/** Claim failures after which the confirmation has nothing left to confirm (WEB ClaimReward). */
export const CLAIM_CLOSES: ReadonlySet<string> = new Set([
  'IDEMPOTENCY_CONFLICT', 'LOYALTY_PROGRAM_PAUSED', 'LOYALTY_PROGRAM_NOT_FOUND', 'LOYALTY_PLAN_REQUIRED',
  'REWARD_UNAVAILABLE', 'REWARD_CATALOG_NOT_FOUND', 'REWARD_CLAIM_LIMIT',
])

/** A key per opened claim confirmation: a double tap or a retry of the same request claims once. */
export const newClaimKey = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

// ---------------------------------------------------------------------------
// Prices and notes (shared personalPricing.ts, BookingRewardChoice.tsx)
// ---------------------------------------------------------------------------

/** A personal price on its own: "Bezpłatnie" at zero, "Cena na miejscu" without a price. */
export const formatPersonalTotal = (total: number | null | undefined): string =>
  total == null ? 'Cena na miejscu' : priceLabel(total)

/** The same value after a colon: "Z nagrodą: bezpłatnie", "Do zapłaty: 50,00 zł". */
export const formatPersonalTotalInline = (total: number | null | undefined): string => {
  const text = formatPersonalTotal(total)
  return text.charAt(0).toLocaleLowerCase('pl') + text.slice(1)
}

/**
 * What is left to pay, as a full sentence: "Do zapłaty: 50,00 zł.", "Do zapłaty:
 * bezpłatnie.". Without a price: "Cenę poznasz na miejscu."
 */
export const amountDueSentence = (total: number | null | undefined, label = 'Do zapłaty'): string =>
  total == null ? 'Cenę poznasz na miejscu.' : `${label}: ${formatPersonalTotalInline(total)}.`

/** "Obecna cena: 72,00 zł": after "cena:" an amount, never "bezpłatnie". */
export const currentPriceLine = (total: number | null) =>
  total != null ? `Obecna cena: ${formatPrice2(total)}` : 'Cena na miejscu'

/** Where a reward refused here can be used instead, in the flow's own words. */
export const LATER: Record<RewardFlow, string> = {
  appointment: 'Użyjesz jej przy wizycie bez promocji.',
  class: 'Użyjesz jej na zajęciach bez promocji.',
  rental: 'Użyjesz jej przy wynajmie bez promocji.',
}

export const NOT_STACKABLE = 'Ta nagroda nie łączy się z promocją.'

/** WEB has no wallet: an unused reward stays on the customer's account. */
export const REWARD_KEPT_NOTE = 'Nagroda zostaje na Twoim koncie.'

/** What the customer should know about one reward's price, each a full sentence. */
export function rewardNotes(
  item: { reward: Pick<MyLoyaltyReward, 'termsSnapshot'>; verdict: UsableVerdict },
  lines: readonly BookingRewardLine[],
  quote: PriceQuote | null,
): string[] {
  const notes: string[] = []
  const selected = lines.filter((line) => item.verdict.lineIndexes.includes(line.index))
  const promoted = (quote?.reward?.lines ?? []).filter((line) => line.promotionPrice != null)
  // D29: a stacking reward counts from the promotional price P; a free item replaces P.
  if (promoted.length === 1) notes.push(`Rabat liczony od ceny promocyjnej: ${formatPrice2(promoted[0]!.promotionPrice!)}.`)
  else if (promoted.length > 1) notes.push('Na pozycjach w promocji rabat liczony jest od ceny promocyjnej.')
  if (item.reward.termsSnapshot.kind === 'free_item' && selected.some((line) => line.promotionId != null)) notes.push('Zastępuje promocję na tej pozycji.')
  // D29b: a reward replaces the tier discount on its positions.
  if (selected.some((line) => line.loyalty?.source === 'tier')) notes.push('Zastępuje rabat Twojego poziomu.')
  if (item.verdict.excluded.length) {
    const names = item.verdict.excluded.map((line) => `„${line.name}”`).join(', ')
    notes.push(`Nie obejmuje: ${names}. ${NOT_STACKABLE}`)
  }
  if (quote?.reward && quote.reward.unusedAmount > 0) notes.push(`Niewykorzystana część nagrody przepada: ${formatPrice2(quote.reward.unusedAmount)}.`)
  return notes
}

/** Why a reward is not offered on this booking, one sentence. */
export function blockedReason(item: Pick<BlockedReward, 'reason'> & { reward: Pick<MyLoyaltyReward, 'termsSnapshot'> }): string {
  const minimum = item.reward.termsSnapshot.minimumTotalGrosze
  if (item.reason === 'promotion') return NOT_STACKABLE
  if (item.reason === 'no_saving') return 'Ta nagroda nie obniży ceny tej rezerwacji.'
  if (item.reason === 'minimum' && minimum) return `Wykorzystasz ją przy rezerwacji za co najmniej ${formatPrice2(minimum)}.`
  return 'Tej nagrody nie użyjesz w tej rezerwacji.'
}

/** The sentence under a blocked reward: where it stays, and for a promotion, where it fits. */
export const blockedKeptNote = (reason: BlockedReward['reason'], flow: RewardFlow) =>
  reason === 'promotion' ? `${REWARD_KEPT_NOTE} ${LATER[flow]}` : REWARD_KEPT_NOTE

/** "Do odebrania za Punkty" or, on a stamp card, "za pieczątki". */
export const claimHeading = (stamps: boolean) => `Do odebrania za ${stamps ? 'pieczątki' : 'Punkty'}`

/** "Koszt: 100" or "Pieczątki: 9": a counter, never a noun agreed with the number. */
export const costLine = (cost: number, stamps: boolean) => `${stamps ? 'Pieczątki' : 'Koszt'}: ${cost}`

/** The footnote of the claimable list. */
export const claimFootnote = (balance: number, stamps: boolean) =>
  `${stamps ? `Pieczątki na koncie: ${balance}.` : `Punkty: ${balance}.`} Odebrana nagroda od razu trafi do tej rezerwacji.`

/** "Rabat 30,00 zł na wszystkie usługi", "Rabat 10% na wybrane usługi", "Darmowa usługa". */
export function rewardBenefit(terms: { kind: LoyaltyRewardKind; value: number; resolvedValue?: number; scope: 'all' | 'selected'; targets?: ReadonlyArray<Pick<LoyaltyTarget, 'kind'>> }): string {
  if (terms.kind === 'free_item') {
    const kind = terms.targets?.[0]?.kind
    if (kind === 'group_class_entry') return 'Darmowe wejście na zajęcia'
    if (kind === 'rental_type' || kind === 'rental_resource') return 'Darmowy wynajem'
    return 'Darmowa usługa'
  }
  const amount = terms.resolvedValue ?? terms.value
  const value = terms.kind === 'percent' ? `${amount}%` : formatPrice2(amount)
  return terms.scope === 'selected' ? `Rabat ${value} na wybrane usługi` : `Rabat ${value} na wszystkie usługi`
}

/** "1 dzień", "2 dni", "21 dni": every count but one takes "dni". */
export const daysPhrase = (days: number) => (days === 1 ? '1 dzień' : `${days} dni`)

export const rewardValidityLine = (validityDays: number | null) =>
  validityDays ? `Ważna ${daysPhrase(validityDays)} od odebrania` : 'Bez terminu ważności'

/** The claimed catalog entry as a reward of the card, until the next read of `me/rewards` brings it. */
export const claimedTerms = (entry: LoyaltyCatalogReward, targetKey: string | null): LoyaltyRewardTerms => ({
  name: entry.name,
  kind: entry.kind,
  resolvedValue: entry.valueAtMin,
  scope: entry.scope,
  targets: entry.targets,
  selectedTargetKey: entry.kind === 'free_item' ? targetKey : null,
  minimumTotalGrosze: entry.minimumTotalGrosze,
  onSiteOnly: entry.onSiteOnly,
  stacksWithPromotions: entry.stacksWithPromotions,
})

// ---------------------------------------------------------------------------
// The customer's progress (WEB LoyaltyProgram.tsx)
// ---------------------------------------------------------------------------

/** A stamp card: the program shows stamps and has a stamp reward. */
export const isStampProgram = (program: Pick<LoyaltyProgramPublic, 'card' | 'stampReward'> | null | undefined) =>
  program?.card?.displayMode === 'stamps' && !!program.stampReward

/**
 * Where the customer stands, one line each: "Punkty: 120", "Poziom: Srebrny",
 * "Do poziomu Złoty: 30"; a stamp card "Do nagrody: 2" or "Nagroda gotowa". A
 * program without tiers says nothing about them.
 */
export function progressLines(wallet: LoyaltyWallet): string[] {
  const out: string[] = []
  if (wallet.stamps) {
    const left = wallet.stamps.stampCount - wallet.stamps.filled
    out.push(left > 0 ? `Do nagrody: ${left}` : 'Nagroda gotowa')
  } else {
    out.push(`Punkty: ${wallet.balance}`)
  }
  if ((wallet.program?.tiers ?? []).length > 0) {
    const { currentTier, nextTier, pointsToNext } = wallet.tier
    out.push(currentTier ? `Poziom: ${currentTier.name}` : 'Bez poziomu')
    out.push(nextTier ? `Do poziomu ${nextTier.name}: ${pointsToNext}` : 'Masz najwyższy poziom')
  }
  return out
}

/** Why the balance is below zero, or null. */
export const negativeBalanceLine = (wallet: Pick<LoyaltyWallet, 'balance' | 'stamps'>): string | null =>
  wallet.balance >= 0
    ? null
    : wallet.stamps
      ? 'Saldo jest ujemne, bo biznes cofnął lub odjął część pieczątek. Nowe pieczątki najpierw wyrównają je do zera.'
      : 'Saldo jest ujemne, bo biznes cofnął lub odjął część Punktów. Nowe Punkty najpierw wyrównają je do zera.'

// ---------------------------------------------------------------------------
// The program's rules (customerLabels.ts, WEB LoyaltyProgram.tsx)
// ---------------------------------------------------------------------------

/** The program in one sentence: what is collected and where. */
export function programIntro(program: Pick<LoyaltyProgramPublic, 'card' | 'stampReward'>): string {
  return isStampProgram(program)
    ? `Zbieraj pieczątki za wizyty i odbierz nagrodę, gdy zapełnisz kartę. Pieczątki do nagrody: ${program.stampReward!.stampCount}.`
    : 'Zbieraj Punkty za wizyty i wymieniaj je na nagrody. Punkty zbierasz i wydajesz tylko w tym miejscu.'
}

export const EARN_RULE_TITLES: Record<LoyaltyEarnRule['kind'], string> = {
  visit: 'Wizyta',
  amount: 'Wydana kwota',
  online_booking: 'Rezerwacja online',
  review: 'Opinia po wizycie',
}

/** "Za każde 10,00 zł wydane na wizytę · od 50,00 zł", what one rule asks for. */
export function earnRuleSubtitle(rule: Pick<LoyaltyEarnRule, 'kind' | 'amountUnitGrosze' | 'minimumTotalGrosze' | 'includePassVisits' | 'includeFreeRewardVisits'>): string {
  const parts: string[] = []
  if (rule.kind === 'visit') parts.push('Za każdą odbytą wizytę')
  if (rule.kind === 'amount' && rule.amountUnitGrosze) parts.push(`Za każde ${formatPrice2(rule.amountUnitGrosze)} wydane na wizytę`)
  if (rule.kind === 'online_booking') parts.push('Za wizytę zarezerwowaną online')
  if (rule.kind === 'review') parts.push('Za opinię po odbytej wizycie')
  if ((rule.kind === 'visit' || rule.kind === 'amount') && rule.minimumTotalGrosze) parts.push(`od ${formatPrice2(rule.minimumTotalGrosze)}`)
  // A pass visit is worth 0 zł, so next to a minimum it never earns (`visitRuleConditions`).
  if (rule.kind === 'visit' && rule.includePassVisits && !rule.minimumTotalGrosze) parts.push('także za wizytę na karnecie')
  return parts.join(' · ')
}

/** "1 miesiąc", "3 miesiące", "12 miesięcy", "22 miesiące". */
export function monthsPhrase(months: number): string {
  const last = months % 10
  const lastTwo = months % 100
  if (months === 1) return '1 miesiąc'
  return `${months} ${last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? 'miesiące' : 'miesięcy'}`
}

export const pointsExpiryLine = (months: number | null | undefined) =>
  months ? `Punkty są ważne ${monthsPhrase(months)} od przyznania.` : 'Punkty nie wygasają.'

type VisitRuleConditions = Pick<LoyaltyEarnRule, 'minimumTotalGrosze' | 'includePassVisits' | 'includeFreeRewardVisits'>

/** Which visits a visit rule counts, one full sentence per option. */
export function visitRuleConditions(rule: VisitRuleConditions): string[] {
  const minimum = !!rule.minimumTotalGrosze
  const passCounts = rule.includePassVisits && !minimum
  return [
    !rule.includePassVisits ? 'Wizyty opłacone karnetem się nie liczą.'
      : minimum ? 'Wizyta opłacona karnetem ma wartość 0 zł, więc nie spełnia minimalnej kwoty.' : 'Wizyty opłacone karnetem też się liczą.',
    !rule.includeFreeRewardVisits ? 'Darmowe wizyty z nagrody się nie liczą.'
      : minimum ? 'Darmowa wizyta z nagrody ma wartość 0 zł, więc nie spełnia minimalnej kwoty.'
        : passCounts ? 'Darmowe wizyty z nagrody też się liczą.' : 'Darmowe wizyty z nagrody się liczą.',
  ]
}

/** The visit rule of a stamp card, one sentence set. */
export function stampRuleSentence(rule: VisitRuleConditions | null | undefined): string {
  if (!rule) return 'Pieczątkę dostajesz za każdą odbytą wizytę.'
  const minimum = rule.minimumTotalGrosze ? `Liczą się wizyty za co najmniej ${formatPrice2(rule.minimumTotalGrosze)}.` : null
  return ['Pieczątkę dostajesz za każdą odbytą wizytę.', minimum, ...visitRuleConditions(rule)].filter(Boolean).join(' ')
}

/** The stamp card's rules in its own words: what one stamp is for and which visits count. */
export const stampRulesLine = (program: Pick<LoyaltyProgramPublic, 'earnRules'>) =>
  stampRuleSentence(program.earnRules.find((item) => item.kind === 'visit'))

/** "Pieczątki i nagroda nie wygasają." or the configured terms of each. */
export function stampValidityLine(months: number | null | undefined, rewardValidityDays: number | null | undefined): string {
  if (!months && !rewardValidityDays) return 'Pieczątki i nagroda nie wygasają.'
  const stamps = months ? `Pieczątki są ważne ${monthsPhrase(months)} od przyznania.` : 'Pieczątki nie wygasają.'
  const reward = rewardValidityDays ? `Nagroda jest ważna ${daysPhrase(rewardValidityDays)} od odebrania.` : 'Nagroda nie wygasa.'
  return `${stamps} ${reward}`
}

/** One row of "Jak to działa": a title, what it means, and the Points it gives ("+5"). */
export type RuleRow = { title: string; text: string; value?: string }

/**
 * "Jak to działa": the stamp card's reward, rules and validity, or how Points are
 * earned here and how long they last. General rules of the program, never a
 * promise about this booking: staff award Points at settlement.
 */
export function programRules(program: LoyaltyProgramPublic, catalog: readonly LoyaltyCatalogReward[] = []): RuleRow[] {
  if (isStampProgram(program)) {
    const reward = catalog.find((entry) => entry.id === program.stampReward!.catalogId) ?? null
    return [
      ...(reward ? [{ title: 'Nagroda', text: reward.name }] : []),
      { title: 'Zasady', text: stampRulesLine(program) },
      { title: 'Ważność', text: stampValidityLine(program.pointsExpiryMonths, reward?.validityDays) },
    ]
  }
  return [
    ...program.earnRules.map((rule) => ({ title: EARN_RULE_TITLES[rule.kind], text: earnRuleSubtitle(rule), value: `+${rule.points}` })),
    { title: 'Ważność', text: pointsExpiryLine(program.pointsExpiryMonths) },
  ]
}
