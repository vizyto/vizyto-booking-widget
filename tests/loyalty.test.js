import { afterEach, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import {
  CLAIM_FALLBACK,
  FIXED_REFUSAL,
  LATER,
  PROGRAM_WAIT_MS,
  READ_TIMEOUT,
  REWARD_KEPT_NOTE,
  REWARD_READ_WAIT_MS,
  REWARD_RECOVERY,
  amountDueSentence,
  appointmentTargetKeys,
  applyRewardQuotes,
  blockedKeptNote,
  blockedReason,
  bookingCatalogCost,
  bookingRewardLines,
  claimErrorMessage,
  claimFootnote,
  claimHeading,
  claimable,
  classEntryKey,
  classExpectedTotalOf,
  costLine,
  currentPriceLine,
  daysPhrase,
  deriveRewardChoice,
  earnRuleSubtitle,
  expectedTotalOf,
  formatPersonalTotalInline,
  judgeBookingReward,
  monthsPhrase,
  negativeBalanceLine,
  noSaving,
  pointsExpiryLine,
  priceWithin,
  programIntro,
  programRules,
  progressLines,
  readRewardInputs,
  refusalMessage,
  refuseLines,
  rentalBaseKey,
  rereadCard,
  rewardCreateAction,
  rewardLapsed,
  rewardNotes,
  rewardValidityLine,
  settleWithin,
  stampRuleSentence,
  stampValidityLine,
  usableOwned,
  withRewardKey,
} from '../src/loyalty.ts'
import {
  bookingIdempotencyKey,
  claimLoyaltyReward,
  createAppointment,
  createRental,
  fetchBusiness,
  getLoyaltyProgram,
  getMyLoyalty,
  getMyLoyaltyRewards,
  quoteWithReward,
  registerForSession,
} from '../src/api.ts'

/** NBSP-insensitive: Intl puts a no-break space before "zł". */
const plain = (s) => s.replace(/[\u00a0\u202f]/g, ' ')

const terms = (patch = {}) => ({
  kind: 'amount', scope: 'all', targets: [], stacksWithPromotions: false, minimumTotalGrosze: null, onSiteOnly: false, ...patch,
})

// B = 100 zł with a 20% promotion (P = 80 zł), an unpromoted 50 zł add-on.
const promoted = {
  index: 0, name: 'Strzyżenie długich włosów', targetKey: 'service:360', price: 8000, promotionId: 1, listPrice: 10000,
  loyalty: { basePrice: 10000, adjustmentPrice: 10000, source: 'promotion', promotionId: 1, promotionPrice: 8000 },
}
const addon = { index: 1, name: 'Mycie', targetKey: 'addon:5', price: 5000, promotionId: null, listPrice: 5000 }

describe('reward choice in a booking (ported from shared bookingRewards.test.ts)', () => {
  test('a stacking reward takes the promoted line', () => {
    expect(judgeBookingReward(terms({ stacksWithPromotions: true }), [promoted])).toEqual({ kind: 'usable', lineIndexes: [0], excluded: [], targetKey: null })
  })

  test('a non-stacking reward is blocked on a promoted line and names it', () => {
    expect(judgeBookingReward(terms(), [promoted])).toEqual({ kind: 'blocked', reason: 'promotion', lines: [promoted] })
  })

  test('a non-stacking reward skips the promoted line and keeps the others', () => {
    expect(judgeBookingReward(terms(), [promoted, addon])).toEqual({ kind: 'usable', lineIndexes: [1], excluded: [promoted], targetKey: null })
  })

  test('a reward for another service is left out', () => {
    expect(judgeBookingReward(terms({ scope: 'selected', targets: [{ kind: 'service', businessServiceId: 359 }] }), [promoted, addon])).toBeNull()
  })

  test('a free item replaces the promotion and takes exactly one line', () => {
    const free = terms({ kind: 'free_item', scope: 'selected', targets: [{ kind: 'service', businessServiceId: 360 }, { kind: 'addon', addonId: 5 }] })
    expect(judgeBookingReward(free, [promoted, addon])).toEqual({ kind: 'usable', lineIndexes: [0], excluded: [], targetKey: 'service:360' })
  })

  test('a claimed free item stays on its chosen position', () => {
    const free = terms({ kind: 'free_item', scope: 'selected', targets: [{ kind: 'service', businessServiceId: 360 }, { kind: 'addon', addonId: 5 }], selectedTargetKey: 'addon:5' })
    expect(judgeBookingReward(free, [promoted, addon])).toEqual({ kind: 'usable', lineIndexes: [1], excluded: [], targetKey: 'addon:5' })
  })

  test('the minimum of a stacking reward counts from P', () => {
    expect(judgeBookingReward(terms({ stacksWithPromotions: true, minimumTotalGrosze: 9000 }), [promoted])).toEqual({ kind: 'blocked', reason: 'minimum', lines: [promoted] })
    expect(judgeBookingReward(terms({ stacksWithPromotions: true, minimumTotalGrosze: 8000 }), [promoted])?.kind).toBe('usable')
  })

  test('the minimum of a free item counts from the regular price', () => {
    expect(judgeBookingReward(terms({ kind: 'free_item', minimumTotalGrosze: 10000 }), [promoted])?.kind).toBe('usable')
  })

  test('a line refused by the API stays out of the next try (extraExcluded)', () => {
    const unpromoted = { ...promoted, promotionId: null }
    expect(judgeBookingReward(terms(), [unpromoted, addon], [0])).toEqual({ kind: 'usable', lineIndexes: [1], excluded: [unpromoted], targetKey: null })
  })

  test('on-site rewards and lines without a price are never offered', () => {
    expect(judgeBookingReward(terms({ onSiteOnly: true }), [addon])).toBeNull()
    expect(judgeBookingReward(terms(), [{ ...addon, price: null }])).toBeNull()
  })

  test('quote lines get their target keys by position', () => {
    const lines = bookingRewardLines([
      { kind: 'service', name: 'A', quantity: 1, listPrice: 100, price: 100, promotionId: null, priorPrice: null, advertised: false, badge: null },
    ], ['service:1'])
    expect(lines[0]).toMatchObject({ index: 0, targetKey: 'service:1', price: 100 })
  })

  test('a free item position may cost its own Points', () => {
    const reward = { kind: 'free_item', pointsCostMin: 9, targets: [{ targetKey: 'service:359', pointsCostOverride: 12 }, { targetKey: 'service:360' }] }
    expect(bookingCatalogCost(reward, 'service:359')).toBe(12)
    expect(bookingCatalogCost(reward, 'service:360')).toBe(9)
    expect(bookingCatalogCost({ kind: 'amount', pointsCostMin: 40, targets: [] }, null)).toBe(40)
  })
})

describe('target keys', () => {
  const quoteLine = (kind, name) => ({ kind, name })

  test('a cart with a length preset and add-ons keys every line in quote order', () => {
    const cart = [
      { businessServiceId: 1, variantMinutes: 45, addons: [] },
      { businessServiceId: 2, variantMinutes: null, addons: [{ id: 101, name: 'Woskowanie' }, { id: 103, name: 'Olejek do brody' }] },
    ]
    const lines = [quoteLine('service', 'Strzyżenie'), quoteLine('service', 'Broda'), quoteLine('addon', 'Olejek do brody'), quoteLine('addon', 'Woskowanie')]
    expect(appointmentTargetKeys(cart, lines)).toEqual(['service_variant:1:45', 'service:2', 'addon:103', 'addon:101'])
  })

  test('an add-on the cart does not know stays unkeyed', () => {
    const cart = [{ businessServiceId: 2, variantMinutes: null, addons: [{ id: 101, name: 'Woskowanie' }] }]
    expect(appointmentTargetKeys(cart, [quoteLine('service', 'Broda'), quoteLine('addon', 'Inny')])).toEqual(['service:2', null])
  })

  test('a rental base is the type for a pool, the unit otherwise', () => {
    expect(rentalBaseKey({ id: 28, rentalTypeId: 7, rentalUnitExposure: 'pool' })).toBe('rental_type:7')
    expect(rentalBaseKey({ id: 28, rentalTypeId: 7, rentalUnitExposure: 'choice' })).toBe('rental_type:7')
    expect(rentalBaseKey({ id: 31, rentalTypeId: 8, rentalUnitExposure: 'unit' })).toBe('rental_resource:31')
    expect(rentalBaseKey({ id: 31, rentalTypeId: 8 })).toBe('rental_resource:31')
    expect(rentalBaseKey({ id: 40, rentalTypeId: null, rentalUnitExposure: 'pool' })).toBe('rental_resource:40')
  })

  test('a class entry is keyed by its class', () => {
    expect(classEntryKey(42)).toBe('group_class_entry:42')
  })
})

// --- the step's lists -------------------------------------------------------

const owned = (id, patch = {}, extra = {}) => ({
  id, catalogId: 100 + id, status: 'available', expiresAt: null,
  termsSnapshot: { name: `Nagroda ${id}`, kind: 'amount', resolvedValue: 2000, scope: 'all', targets: [], selectedTargetKey: null, minimumTotalGrosze: null, onSiteOnly: false, stacksWithPromotions: false, ...patch },
  ...extra,
})
const catalogEntry = (id, patch = {}) => ({
  id, name: `Katalog ${id}`, kind: 'percent', value: 10, pointsCostMin: 100, pointsCostMax: 100, pointsCostStep: 1, valueAtMin: 10, valuePerStep: 0,
  minimumTotalGrosze: null, stacksWithPromotions: true, onSiteOnly: false, validityDays: 90, scope: 'all', targets: [], ...patch,
})
const quote = (total, extra = {}) => ({ lines: [], total, listTotal: total, priorTotal: null, advertised: false, badge: null, assignedResourceId: null, pricingToken: 't', ...extra })
const plainLine = { index: 0, name: 'Strzyżenie', targetKey: 'service:1', price: 6000, promotionId: null, listPrice: 6000 }

describe('usable, blocked and claimable', () => {
  const base = { catalog: [], wallet: { balance: 0 }, lines: [plainLine], ordinaryTotal: 6000, refused: {}, quotes: {} }

  test('a reward without an answer is usable and waits for its price', () => {
    const view = deriveRewardChoice({ ...base, owned: [owned(1)] })
    expect(view.usable.map((u) => [u.reward.id, u.quote])).toEqual([[1, null]])
    expect(view.toPrice).toEqual([{ rewardId: 1, lineIndexes: [0] }])
  })

  test('a priced reward is usable; one that saves nothing is blocked', () => {
    const view = deriveRewardChoice({
      ...base,
      owned: [owned(1), owned(2)],
      quotes: { 1: { status: 'ok', key: '0', quote: quote(4000) }, 2: { status: 'ok', key: '0', quote: quote(6000) } },
    })
    expect(view.usable.map((u) => u.reward.id)).toEqual([1])
    expect(view.blocked.map((b) => [b.reward.id, b.reason])).toEqual([[2, 'no_saving']])
    expect(view.toPrice).toEqual([])
  })

  test('promotion and minimum blocks come from the line rule', () => {
    const promo = { ...plainLine, promotionId: 3, price: 4800 }
    const view = deriveRewardChoice({
      ...base,
      lines: [promo],
      owned: [owned(1), owned(2, { stacksWithPromotions: true, minimumTotalGrosze: 9000 })],
    })
    expect(view.blocked.map((b) => [b.reward.id, b.reason])).toEqual([[1, 'promotion'], [2, 'minimum']])
    expect(view.usable).toEqual([])
  })

  test('a server refusal of the whole reward blocks it as unavailable', () => {
    const view = deriveRewardChoice({ ...base, owned: [owned(1)], quotes: { 1: { status: 'error', key: '0', code: 'REWARD_UNAVAILABLE' } } })
    expect(view.blocked.map((b) => b.reason)).toEqual(['unavailable'])
  })

  test('a remaining line conflict drops the reward; a network failure keeps it with a retry', () => {
    const conflict = deriveRewardChoice({ ...base, owned: [owned(1)], quotes: { 1: { status: 'error', key: '0', code: 'REWARD_DISCOUNT_CONFLICT' } } })
    expect(conflict.usable).toEqual([])
    expect(conflict.blocked).toEqual([])
    const network = deriveRewardChoice({ ...base, owned: [owned(1)], quotes: { 1: { status: 'error', key: '0', code: 'NETWORK' } } })
    expect(network.usable[0].quote).toEqual({ status: 'error', key: '0', code: 'NETWORK' })
  })

  test('an answer for other lines is not this selection\'s answer', () => {
    const view = deriveRewardChoice({ ...base, owned: [owned(1)], quotes: { 1: { status: 'ok', key: '0,1', quote: quote(4000) } } })
    expect(view.toPrice).toEqual([{ rewardId: 1, lineIndexes: [0] }])
  })

  test('a free item takes one line of the booking', () => {
    const second = { ...plainLine, index: 1, targetKey: 'service:2' }
    const free = owned(1, { kind: 'free_item', scope: 'selected', targets: [{ kind: 'service', businessServiceId: 1 }, { kind: 'service', businessServiceId: 2 }] })
    const view = deriveRewardChoice({ ...base, lines: [plainLine, second], owned: [free] })
    expect(view.usable[0].verdict.lineIndexes).toEqual([0])
  })

  test('refused lines stay out of the next try', () => {
    const second = { ...plainLine, index: 1, name: 'Broda', targetKey: 'service:2' }
    const view = deriveRewardChoice({ ...base, lines: [plainLine, second], owned: [owned(1)], refused: { 1: [1] } })
    expect(view.usable[0].verdict.lineIndexes).toEqual([0])
    expect(view.usable[0].verdict.excluded.map((l) => l.name)).toEqual(['Broda'])
  })

  test('lapsed, reserved and on-site rewards are never offered', () => {
    const list = [
      owned(1),
      owned(2, {}, { status: 'reserved' }),
      owned(3, {}, { expiresAt: '2020-01-01T00:00:00.000Z' }),
      owned(4, { onSiteOnly: true }),
    ]
    expect(usableOwned(list).map((r) => r.id)).toEqual([1])
    expect(rewardLapsed(list[2])).toBe(true)
    expect(rewardLapsed(list[1])).toBe(false)
  })

  test('claimable: not on site, not owned, within the balance, and fits the booking', () => {
    const catalog = [
      catalogEntry(1),
      catalogEntry(2, { onSiteOnly: true }),
      catalogEntry(3),
      catalogEntry(4, { pointsCostMin: 500 }),
      catalogEntry(5, { scope: 'selected', targets: [{ kind: 'service', businessServiceId: 99, targetKey: 'service:99' }] }),
      catalogEntry(6, { kind: 'free_item', value: 0, pointsCostMin: 50, scope: 'selected', targets: [{ kind: 'service', businessServiceId: 1, targetKey: 'service:1', pointsCostOverride: 80 }] }),
    ]
    const list = claimable(catalog, [{ catalogId: 3 }], { balance: 120 }, [plainLine])
    expect(list.map((c) => [c.catalog.id, c.cost, c.targetKey])).toEqual([[1, 100, null], [6, 80, 'service:1']])
    expect(claimable(catalog, [], null, [plainLine])).toEqual([])
  })

  test('no saving means not cheaper than today', () => {
    expect(noSaving(5000, 5000)).toBe(true)
    expect(noSaving(4999, 5000)).toBe(false)
    expect(noSaving(null, 5000)).toBe(false)
    expect(noSaving(0, null)).toBe(false)
  })
})

describe('reward quotes round by round', () => {
  const asked = [{ rewardId: 1, lineIndexes: [0, 1] }, { rewardId: 2, lineIndexes: [0] }]

  test('a line conflict refuses the new lines and asks again', () => {
    const next = applyRewardQuotes({ refused: {}, quotes: {} }, asked, [
      { ok: false, code: 'REWARD_DISCOUNT_CONFLICT', lineIndexes: [1] },
      { ok: true, quote: quote(3000) },
    ])
    expect(next.refused).toEqual({ 1: [1] })
    expect(next.quotes[1]).toBeUndefined()
    expect(next.quotes[2]).toEqual({ status: 'ok', key: '0', quote: quote(3000) })
  })

  test('a conflict that names nothing new is the answer', () => {
    const next = applyRewardQuotes({ refused: { 1: [1] }, quotes: {} }, [asked[0]], [{ ok: false, code: 'REWARD_DISCOUNT_CONFLICT', lineIndexes: [1] }])
    expect(next.quotes[1]).toMatchObject({ status: 'error', code: 'REWARD_DISCOUNT_CONFLICT' })
  })

  test('a quote without a token cannot be booked', () => {
    const next = applyRewardQuotes({ refused: {}, quotes: {} }, [asked[1]], [{ ok: true, quote: quote(3000, { pricingToken: undefined }) }])
    expect(next.quotes[2]).toMatchObject({ status: 'error', code: 'NO_PRICING_TOKEN' })
  })

  test('a create-time conflict joins the refused set', () => {
    expect(refuseLines({ 1: [0] }, 1, [0, 2])).toEqual({ 1: [0, 2] })
    expect(refuseLines({}, 4, [1])).toEqual({ 4: [1] })
  })
})

describe('create errors', () => {
  test('each code maps to its recovery', () => {
    expect(rewardCreateAction('REWARD_QUOTE_EXPIRED', true)).toBe('fresh_quote')
    expect(rewardCreateAction('PRICE_CHANGED', true)).toBe('fresh_quote')
    expect(rewardCreateAction('PRICE_CHANGED', false)).toBe('price_changed')
    expect(rewardCreateAction('REWARD_DISCOUNT_CONFLICT', false)).toBe('conflict')
    expect(rewardCreateAction('REWARD_UNAVAILABLE', false)).toBe('unavailable')
    expect(rewardCreateAction('REWARD_QUOTE_EXPIRED', false)).toBe('unavailable')
    expect(rewardCreateAction('LOYALTY_PROGRAM_PAUSED', false)).toBe('refusal')
    expect(rewardCreateAction('LOYALTY_PLAN_REQUIRED', false)).toBe('refusal')
    expect(rewardCreateAction('REWARD_EXPECTED_TOTAL_REQUIRED', false)).toBe('refusal')
    expect(rewardCreateAction('SLOT_TAKEN', false)).toBeNull()
    expect(rewardCreateAction('NETWORK', false)).toBeNull()
  })

  test('a refusal shows the API sentence, else the fixed one', () => {
    expect(refusalMessage('Program jest wstrzymany.', 'LOYALTY_PROGRAM_PAUSED')).toBe('Program jest wstrzymany.')
    expect(refusalMessage('LOYALTY_PROGRAM_PAUSED', 'LOYALTY_PROGRAM_PAUSED')).toBe(FIXED_REFUSAL)
    expect(refusalMessage(undefined, 'LOYALTY_PLAN_REQUIRED')).toBe(FIXED_REFUSAL)
  })

  test('the reward is folded into the idempotency key only when chosen', () => {
    expect(withRewardKey('vzw-24-x', 4701)).toBe('vzw-24-x-r4701')
    expect(withRewardKey('vzw-24-x', null)).toBe('vzw-24-x')
  })

  test('claim errors read like the shared ones', () => {
    expect(claimErrorMessage('IDEMPOTENCY_CONFLICT')).toBe('Ta nagroda została już odebrana.')
    expect(claimErrorMessage('REWARD_UNAVAILABLE', 'x')).toBe('Tej nagrody nie można teraz odebrać. Lista nagród została odświeżona.')
    expect(claimErrorMessage('INSUFFICIENT_POINTS', 'Masz za mało Punktów.')).toBe('Masz za mało Punktów.')
    expect(claimErrorMessage('LOYALTY_PROGRAM_PAUSED', 'LOYALTY_PROGRAM_PAUSED')).toBe(CLAIM_FALLBACK)
    expect(claimErrorMessage('HTTP_500', 'Internal')).toBe(CLAIM_FALLBACK)
  })
})

describe('the success screen\'s program block waits a bounded time', () => {
  const later = (value, ms) => new Promise((resolve) => setTimeout(() => resolve(value), ms))

  test('an answer already there comes at once', async () => {
    const block = { program: { id: 1 } }
    expect(await settleWithin(Promise.resolve(block), 50)).toBe(block)
    expect(await settleWithin(Promise.resolve(null), 50)).toBeNull()
  })

  test('an answer within the wait is taken', async () => {
    expect(await settleWithin(later('card', 10), 200)).toBe('card')
  })

  test('a late answer is dropped, not added later', async () => {
    const started = Date.now()
    expect(await settleWithin(later('card', 300), 30)).toBeNull()
    expect(Date.now() - started).toBeLessThan(250)
  })

  test('a failed read is no block', async () => {
    expect(await settleWithin(Promise.reject(new Error('offline')), 50)).toBeNull()
  })
})

describe('the reads in front of a create wait a bounded time', () => {
  const later = (value, ms) => new Promise((resolve) => setTimeout(() => resolve(value), ms))
  const never = () => new Promise(() => {})
  const program = { id: 4710, status: 'active' }
  const wallet = { balance: 120, program: { status: 'active' } }
  const owned = [{ id: 4701 }]
  const catalog = [{ id: 47104 }]
  const waits = { program: 40, card: 60 }
  /** The four reads, each answering `answers[name]` (a value or a promise), and which ones were asked. */
  const reads = (answers = {}) => {
    const asked = []
    const read = (name, value) => () => {
      asked.push(name)
      const answer = name in answers ? answers[name] : value
      return answer instanceof Promise ? answer : Promise.resolve(answer)
    }
    return {
      asked,
      reads: {
        program: read('program', program),
        wallet: read('wallet', wallet),
        owned: read('owned', owned),
        catalog: read('catalog', catalog),
      },
    }
  }

  test('the constants: the program first and short, then a few seconds per stage', () => {
    expect(PROGRAM_WAIT_MS).toBe(1500)
    expect(REWARD_READ_WAIT_MS).toBe(3000)
  })

  test('answers in time are the step\'s inputs', async () => {
    const r = reads()
    expect(await readRewardInputs(r.reads, waits)).toEqual({ wallet, owned, catalog })
    expect(r.asked).toEqual(['program', 'wallet', 'owned', 'catalog'])
  })

  test('no program, or none in time, is no loyalty, and the card is never asked for', async () => {
    for (const answer of [() => null, never, () => later(program, 400), () => Promise.reject(new Error('offline'))]) {
      const r = reads({ program: answer() })
      const started = Date.now()
      expect(await readRewardInputs(r.reads, waits)).toBeNull()
      expect(Date.now() - started).toBeLessThan(300)
      expect(r.asked).toEqual(['program'])
    }
  })

  test('a card read that stalls is no loyalty after its wait', async () => {
    for (const name of ['wallet', 'owned', 'catalog']) {
      const r = reads({ [name]: never() })
      const started = Date.now()
      expect(await readRewardInputs(r.reads, waits)).toBeNull()
      expect(Date.now() - started).toBeLessThan(300)
    }
  })

  test('no card, or a program that is not active on it, is no loyalty', async () => {
    expect(await readRewardInputs(reads({ wallet: null }).reads, waits)).toBeNull()
    expect(await readRewardInputs(reads({ wallet: { ...wallet, program: { status: 'paused' } } }).reads, waits)).toBeNull()
  })

  test('the default waits are the constants', async () => {
    const r = reads({ program: later(program, 5) })
    expect(await readRewardInputs(r.reads)).toEqual({ wallet, owned, catalog })
  })
})

describe('the reads inside the "Nagroda" step wait a bounded time', () => {
  const later = (value, ms) => new Promise((resolve) => setTimeout(() => resolve(value), ms))
  const never = () => new Promise(() => {})
  const priced = { ok: true, quote: quote(4000) }

  test('a price in time is the answer', async () => {
    expect(await priceWithin(later(priced, 5), 100)).toBe(priced)
    const refusal = { ok: false, code: 'REWARD_UNAVAILABLE' }
    expect(await priceWithin(Promise.resolve(refusal), 100)).toBe(refusal)
  })

  test('a price that stalls or throws is a failed price after its wait', async () => {
    for (const read of [never, () => later(priced, 400), () => Promise.reject(new Error('offline'))]) {
      const started = Date.now()
      expect(await priceWithin(read(), 40)).toEqual({ ok: false, code: READ_TIMEOUT })
      expect(Date.now() - started).toBeLessThan(300)
    }
  })

  test('a timed-out price keeps the reward on the list with a retry, like a network failure', () => {
    const base = { catalog: [], wallet: { balance: 0 }, lines: [plainLine], ordinaryTotal: 6000, refused: {} }
    const asked = [{ rewardId: 1, lineIndexes: [0] }]
    const state = applyRewardQuotes({ refused: {}, quotes: {} }, asked, [{ ok: false, code: READ_TIMEOUT }])
    expect(state.quotes[1]).toEqual({ status: 'error', key: '0', code: READ_TIMEOUT })
    const view = deriveRewardChoice({ ...base, ...state, owned: [owned(1)] })
    expect(view.usable.map((u) => [u.reward.id, u.quote?.status])).toEqual([[1, 'error']])
    expect(view.blocked).toEqual([])
    // Not asked again on its own: "Spróbuj ponownie" asks for it.
    expect(view.toPrice).toEqual([])
  })

  test('the card read again in time is the answer; a stall or a throw keeps what the step has', async () => {
    const card = { balance: 20 }
    const list = [owned(1)]
    expect(await rereadCard({ wallet: () => later(card, 5), owned: () => Promise.resolve(list) }, 100)).toEqual([card, list])
    for (const reads of [
      { wallet: never, owned: () => Promise.resolve(list) },
      { wallet: () => Promise.resolve(card), owned: () => later(list, 400) },
      { wallet: () => Promise.reject(new Error('offline')), owned: () => Promise.resolve(list) },
    ]) {
      const started = Date.now()
      expect(await rereadCard(reads, 40)).toBeNull()
      expect(Date.now() - started).toBeLessThan(300)
    }
  })

  test('the default wait is the one of the reads in front of a create', async () => {
    expect(await priceWithin(Promise.resolve(priced))).toBe(priced)
    expect(await rereadCard({ wallet: () => Promise.resolve(null), owned: () => Promise.resolve([]) })).toEqual([null, []])
  })
})

describe('copy', () => {
  const wallet = (patch = {}) => ({
    balance: 120, tierPoints: 170, stamps: null,
    tier: { currentTier: { id: 1, name: 'Srebrny' }, nextTier: { id: 2, name: 'Złoty' }, pointsToNext: 30, progress: 0.85 },
    program: { tiers: [{ id: 1 }, { id: 2 }] },
    ...patch,
  })

  test('progress lines', () => {
    expect(progressLines(wallet())).toEqual(['Punkty: 120', 'Poziom: Srebrny', 'Do poziomu Złoty: 30'])
    expect(progressLines(wallet({ tier: { currentTier: null, nextTier: null, pointsToNext: 0, progress: 1 } }))).toEqual(['Punkty: 120', 'Bez poziomu', 'Masz najwyższy poziom'])
    expect(progressLines(wallet({ program: { tiers: [] } }))).toEqual(['Punkty: 120'])
    expect(progressLines(wallet({ program: { tiers: [] }, stamps: { catalogId: 1, stampCount: 9, filled: 9 } }))).toEqual(['Nagroda gotowa'])
    expect(progressLines(wallet({ program: { tiers: [] }, stamps: { catalogId: 1, stampCount: 9, filled: 7 } }))).toEqual(['Do nagrody: 2'])
    expect(negativeBalanceLine({ balance: 4, stamps: null })).toBeNull()
    expect(negativeBalanceLine({ balance: -4, stamps: null })).toContain('Punktów')
  })

  test('months and validity', () => {
    expect([1, 3, 12, 22].map(monthsPhrase)).toEqual(['1 miesiąc', '3 miesiące', '12 miesięcy', '22 miesiące'])
    expect(pointsExpiryLine(12)).toBe('Punkty są ważne 12 miesięcy od przyznania.')
    expect(pointsExpiryLine(null)).toBe('Punkty nie wygasają.')
    expect(stampValidityLine(null, null)).toBe('Pieczątki i nagroda nie wygasają.')
    expect(stampValidityLine(3, 60)).toBe('Pieczątki są ważne 3 miesiące od przyznania. Nagroda jest ważna 60 dni od odebrania.')
  })

  test('a one-day reward reads "1 dzień" (the API allows validityDays from 1)', () => {
    expect([1, 2, 5, 21, 90].map(daysPhrase)).toEqual(['1 dzień', '2 dni', '5 dni', '21 dni', '90 dni'])
    expect(rewardValidityLine(1)).toBe('Ważna 1 dzień od odebrania')
    expect(rewardValidityLine(30)).toBe('Ważna 30 dni od odebrania')
    expect(rewardValidityLine(null)).toBe('Bez terminu ważności')
    expect(stampValidityLine(null, 1)).toBe('Pieczątki nie wygasają. Nagroda jest ważna 1 dzień od odebrania.')
  })

  test('earn and stamp rules', () => {
    const rule = { kind: 'amount', amountUnitGrosze: 1000, minimumTotalGrosze: 5000, includePassVisits: false, includeFreeRewardVisits: false }
    expect(plain(earnRuleSubtitle(rule))).toBe('Za każde 10,00 zł wydane na wizytę · od 50,00 zł')
    expect(stampRuleSentence(null)).toBe('Pieczątkę dostajesz za każdą odbytą wizytę.')
    expect(stampRuleSentence({ minimumTotalGrosze: null, includePassVisits: true, includeFreeRewardVisits: true }))
      .toBe('Pieczątkę dostajesz za każdą odbytą wizytę. Wizyty opłacone karnetem też się liczą. Darmowe wizyty z nagrody też się liczą.')
  })

  test('program intro and rules', () => {
    const points = { card: { displayMode: 'points' }, stampReward: null, pointsExpiryMonths: 12, earnRules: [{ id: 1, kind: 'online_booking', points: 5, amountUnitGrosze: null, minimumTotalGrosze: null, includePassVisits: false, includeFreeRewardVisits: false }] }
    expect(programIntro(points)).toBe('Zbieraj Punkty za wizyty i wymieniaj je na nagrody. Punkty zbierasz i wydajesz tylko w tym miejscu.')
    expect(programRules(points)).toEqual([
      { title: 'Rezerwacja online', text: 'Za wizytę zarezerwowaną online', value: '+5' },
      { title: 'Ważność', text: 'Punkty są ważne 12 miesięcy od przyznania.' },
    ])
    const stamps = { card: { displayMode: 'stamps' }, stampReward: { catalogId: 7, stampCount: 9 }, pointsExpiryMonths: null, earnRules: [] }
    expect(programIntro(stamps)).toContain('Pieczątki do nagrody: 9.')
    expect(programRules(stamps, [catalogEntry(7, { name: 'Darmowe strzyżenie', validityDays: null })]).map((r) => r.title)).toEqual(['Nagroda', 'Zasady', 'Ważność'])
  })

  test('prices, notes and reasons', () => {
    expect(plain(currentPriceLine(7200))).toBe('Obecna cena: 72,00 zł')
    expect(currentPriceLine(null)).toBe('Cena na miejscu')
    expect(formatPersonalTotalInline(0)).toBe('bezpłatnie')
    expect(plain(amountDueSentence(5000))).toBe('Do zapłaty: 50,00 zł.')
    expect(amountDueSentence(0, 'Do zapłaty z nagrodą')).toBe('Do zapłaty z nagrodą: bezpłatnie.')
    expect(amountDueSentence(null)).toBe('Cenę poznasz na miejscu.')
    const verdict = { kind: 'usable', lineIndexes: [1], excluded: [promoted], targetKey: null }
    const notes = rewardNotes({ reward: owned(1), verdict }, [promoted, addon], quote(3000, { reward: { rewardId: 1, discount: 2000, unusedAmount: 500, lines: [] } }))
    expect(notes.map(plain)).toEqual(['Nie obejmuje: „Strzyżenie długich włosów”. Ta nagroda nie łączy się z promocją.', 'Niewykorzystana część nagrody przepada: 5,00 zł.'])
    expect(plain(blockedReason({ reason: 'minimum', reward: owned(1, { minimumTotalGrosze: 8000 }) }))).toBe('Wykorzystasz ją przy rezerwacji za co najmniej 80,00 zł.')
    expect(blockedReason({ reason: 'no_saving', reward: owned(1) })).toBe('Ta nagroda nie obniży ceny tej rezerwacji.')
    expect(blockedKeptNote('promotion', 'class')).toBe(`${REWARD_KEPT_NOTE} ${LATER.class}`)
    expect(blockedKeptNote('minimum', 'rental')).toBe(REWARD_KEPT_NOTE)
    expect(claimHeading(true)).toBe('Do odebrania za pieczątki')
    expect(costLine(100, false)).toBe('Koszt: 100')
    expect(costLine(9, true)).toBe('Pieczątki: 9')
    expect(claimFootnote(120, false)).toBe('Punkty: 120. Odebrana nagroda od razu trafi do tej rezerwacji.')
  })

  test('no copy carries an en or em dash, nor a platform-wide program', () => {
    const files = [
      'src/loyalty.ts', 'src/api.ts', 'src/mock.ts', 'src/BookingFlow.tsx',
      'src/steps/StepReward.tsx', 'src/steps/LoyaltyProgram.tsx', 'src/steps/StepDone.tsx', 'README.md',
    ]
    for (const file of files) {
      const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
      expect({ file, dash: /[\u2013\u2014]/.test(text) }).toEqual({ file, dash: false })
      expect({ file, club: /Vizyto Club/i.test(text) }).toEqual({ file, club: false })
    }
    for (const text of Object.values(REWARD_RECOVERY).flatMap((x) => [x.title, x.text])) expect(text).not.toMatch(/[\u2013\u2014]/)
  })
})

// --- the contract through the mock backend and the HTTP client --------------

const mockCfg = (businessId) => ({ apiBase: 'mock', siteKey: 'pk', businessId, mock: true, channel: 'widget' })

describe('mock loyalty (471 points, 472 stamps)', () => {
  test('only the loyalty ids have a program', async () => {
    expect(await getLoyaltyProgram(mockCfg(24))).toBeNull()
    expect((await getLoyaltyProgram(mockCfg(471)))?.card.displayMode).toBe('points')
    expect((await getLoyaltyProgram(mockCfg(472)))?.stampReward).toEqual({ catalogId: 47201, stampCount: 9 })
    expect(await getMyLoyalty(mockCfg(471), null)).toBeNull()
    expect(await getMyLoyaltyRewards(mockCfg(24), 'mock-token')).toEqual([])
  })

  test('a non-stacking reward is refused on a hidden promotion, with its line', async () => {
    const payload = { items: [{ businessServiceId: 2, addonIds: [101, 102] }], startDate: '2030-01-07T08:00:00.000Z' }
    const refused = await quoteWithReward(mockCfg(471), { flow: 'appointment', payload }, { rewardId: 4701, lineIndexes: [0, 1, 2] }, 'mock-token')
    expect(refused).toMatchObject({ ok: false, code: 'REWARD_DISCOUNT_CONFLICT', lineIndexes: [2] })
    const priced = await quoteWithReward(mockCfg(471), { flow: 'appointment', payload }, { rewardId: 4701, lineIndexes: [0, 1] }, 'mock-token')
    expect(priced.ok).toBe(true)
    expect(priced.quote.pricingToken).toBe('mock-reward-4701')
    expect(priced.quote.reward).toMatchObject({ rewardId: 4701, discount: 2000, unusedAmount: 0 })
  })

  test('a claim lowers the balance and adds the reward; the same key claims once', async () => {
    const before = (await getMyLoyalty(mockCfg(471), 'mock-token')).balance
    const first = await claimLoyaltyReward(mockCfg(471), { catalogId: 47104, idempotencyKey: 'k-1', pointsCost: 100 }, 'mock-token')
    const again = await claimLoyaltyReward(mockCfg(471), { catalogId: 47104, idempotencyKey: 'k-1', pointsCost: 100 }, 'mock-token')
    expect(first.ok && again.ok && first.rewardId === again.rewardId).toBe(true)
    expect((await getMyLoyalty(mockCfg(471), 'mock-token')).balance).toBe(before - 100)
    const short = await claimLoyaltyReward(mockCfg(471), { catalogId: 47105, idempotencyKey: 'k-2', pointsCost: 500 }, 'mock-token')
    expect(short).toMatchObject({ ok: false, code: 'INSUFFICIENT_POINTS' })
  })

  test('a create with a reward reserves it; the taken one answers REWARD_UNAVAILABLE', async () => {
    await fetchBusiness(mockCfg(471))
    const reward = (id) => ({ rewardSelection: { rewardId: id, lineIndexes: [0] }, discountChoice: 'reward', pricingToken: `mock-reward-${id}` })
    const items = [{ businessServiceId: 8 }]
    const taken = await createAppointment(mockCfg(471), { items, startDate: '2030-01-07T08:00:00.000Z', bookedById: 1, idempotencyKey: 'a', expectedTotal: 2500, reward: reward(4703) }, 'mock-token')
    expect(taken).toMatchObject({ ok: false, code: 'REWARD_UNAVAILABLE' })
    const booked = await createAppointment(mockCfg(471), { items, startDate: '2030-01-07T08:00:00.000Z', bookedById: 1, idempotencyKey: 'b', expectedTotal: 2000, reward: reward(4701) }, 'mock-token')
    expect(booked.ok).toBe(true)
    const statuses = Object.fromEntries((await getMyLoyaltyRewards(mockCfg(471), 'mock-token')).map((r) => [r.id, r.status]))
    expect(statuses[4701]).toBe('reserved')
    expect(statuses[4703]).toBe('reserved')
  })

  test('the expiring class term answers a fresh quote once', async () => {
    await fetchBusiness(mockCfg(472))
    const reward = { rewardSelection: { rewardId: 4721, lineIndexes: [0] }, discountChoice: 'reward', pricingToken: 'mock-reward-4721' }
    const first = await registerForSession(mockCfg(472), { sessionId: 912, bookedById: 1, idempotencyKey: 'c', expectedTotal: 0, reward }, 'mock-token')
    expect(first).toMatchObject({ ok: false, code: 'REWARD_QUOTE_EXPIRED' })
    expect(first.pricing?.pricingToken).toBe('mock-reward-4721')
    const retry = await registerForSession(mockCfg(472), { sessionId: 912, bookedById: 1, idempotencyKey: 'c', expectedTotal: 0, reward }, 'mock-token')
    expect(retry.ok).toBe(true)
  })

  test('a rental at 18:00 finds a promotion that started after the quote', async () => {
    await fetchBusiness(mockCfg(471))
    const startDate = '2030-01-07T17:00:00.000Z' // 18:00 in Warsaw (winter)
    const reward = { rewardSelection: { rewardId: 4702, lineIndexes: [0] }, discountChoice: 'reward', pricingToken: 'mock-reward-4702' }
    // A free item replaces a promotion, so the lever lets it through untouched.
    const free = await createRental(mockCfg(471), { rentalTypeId: 7, startDate, endDate: '2030-01-07T18:00:00.000Z', bookedById: 1, idempotencyKey: 'r', expectedTotal: 0, reward }, 'mock-token')
    expect(free.ok).toBe(true)
  })
})

describe('reward fields in the HTTP bodies', () => {
  const realFetch = globalThis.fetch
  afterEach(() => { globalThis.fetch = realFetch })

  async function exchange(write, status = 200, answer = {}) {
    const calls = []
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), method: init?.method ?? 'GET', raw: init?.body ?? null, body: init?.body ? JSON.parse(init.body) : null, headers: init?.headers ?? {} })
      return new Response(JSON.stringify(answer), { status, headers: { 'content-type': 'application/json' } })
    }
    const result = await write()
    return { calls, result }
  }
  const cfg = { apiBase: 'https://api.example.test', siteKey: 'pk_x', businessId: 24, channel: 'widget' }
  const reward = { rewardSelection: { rewardId: 9, lineIndexes: [0] }, discountChoice: 'reward', pricingToken: 'tok' }

  test('a create with a reward sends its fields next to expectedTotal; without one, none', async () => {
    const withReward = await exchange(() => createAppointment(cfg, { items: [], startDate: 's', bookedById: 1, idempotencyKey: 'k-r9', expectedTotal: 3000, reward }, 't'))
    expect(withReward.calls[0].body).toMatchObject({ expectedTotal: 3000, rewardSelection: { rewardId: 9, lineIndexes: [0] }, discountChoice: 'reward', pricingToken: 'tok' })
    const plainWrite = await exchange(() => registerForSession(cfg, { sessionId: 1, bookedById: 1, idempotencyKey: 'k' }, 't'))
    for (const key of ['rewardSelection', 'discountChoice', 'pricingToken']) expect(key in plainWrite.calls[0].body).toBe(false)
  })

  // v1.16.0 (before loyalty) sent exactly these bytes. A create with no reward (no
  // program, no card, nothing to offer, "Bez nagrody") must still send them: no
  // reward keys, not even `reward: null`, and no "-r" in the Idempotency-Key. Each
  // write is called the way BookingFlow calls it then: `reward: null`, the key
  // through withRewardKey(base, undefined) and expectedTotal through the same helper.
  describe('a create without a reward is the v1.16.0 request, byte for byte', () => {
    const v116Headers = (key) => ({ 'content-type': 'application/json', 'x-vizyto-site-key': 'pk_x', 'Idempotency-Key': key, authorization: 'Bearer t' })

    test('a visit (createAppointment)', async () => {
      const items = [{ businessServiceId: 1, resourceId: null, addonIds: [103, 101], durationMinutes: 45 }]
      const startDate = '2030-01-07T08:00:00.000Z'
      const notes = 'Proszę o ciszę'
      const write = (pricing, writeCfg = cfg) => createAppointment(writeCfg, {
        items,
        startDate,
        bookedById: 555,
        notes,
        ...expectedTotalOf(pricing, null),
        idempotencyKey: withRewardKey(bookingIdempotencyKey({ businessId: 24, startDate, items, bookedById: 555, notes }), undefined),
        reward: null,
      }, 't')
      const key = 'vzw-24-2030-01-07T08:00:00.000Z-1-any-101.103-45-555-14'
      const items116 = '[{"businessServiceId":1,"resourceId":null,"addonIds":[103,101],"durationMinutes":45}]'

      const priced = await exchange(() => write(quote(5000)))
      expect(priced.calls[0].url).toBe('https://api.example.test/api/public/businesses/24/appointments')
      expect(priced.calls[0].method).toBe('POST')
      expect(priced.calls[0].raw).toBe(`{"bookedById":555,"items":${items116},"startDate":"2030-01-07T08:00:00.000Z","notes":"Proszę o ciszę","expectedTotal":5000}`)
      expect(priced.calls[0].headers).toEqual(v116Headers(key))

      // A failed quote sends no expectedTotal; a vizyto.com short link adds entryPoint last.
      const unpriced = await exchange(() => write(null, { ...cfg, entryPoint: 'qr' }))
      expect(unpriced.calls[0].raw).toBe(`{"bookedById":555,"items":${items116},"startDate":"2030-01-07T08:00:00.000Z","notes":"Proszę o ciszę","entryPoint":"qr"}`)
      expect(unpriced.calls[0].headers).toEqual(v116Headers(key))
    })

    test('a rental (createRental), a pool and one unit', async () => {
      const startDate = '2030-01-07T09:00:00.000Z'
      const endDate = '2030-01-07T11:00:00.000Z'
      const write = (target, pricing, partySize) => createRental(cfg, {
        ...target,
        startDate,
        endDate,
        bookedById: 555,
        notes: undefined,
        partySize,
        ...expectedTotalOf(pricing, null),
        idempotencyKey: withRewardKey(`vzw-rnt-24-${startDate}-${target.resourceId ?? 't' + target.rentalTypeId}-2-555`, undefined),
        reward: null,
      }, 't')

      const pool = await exchange(() => write({ rentalTypeId: 7 }, quote(6400), 3))
      expect(pool.calls[0].url).toBe('https://api.example.test/api/public/businesses/24/rentals')
      expect(pool.calls[0].method).toBe('POST')
      expect(pool.calls[0].raw).toBe('{"resourceId":null,"rentalTypeId":7,"startDate":"2030-01-07T09:00:00.000Z","endDate":"2030-01-07T11:00:00.000Z","bookedById":555,"partySize":3,"expectedTotal":6400}')
      expect(pool.calls[0].headers).toEqual(v116Headers('vzw-rnt-24-2030-01-07T09:00:00.000Z-t7-2-555'))

      const unit = await exchange(() => write({ resourceId: 31 }, null, null))
      expect(unit.calls[0].raw).toBe('{"resourceId":31,"rentalTypeId":null,"startDate":"2030-01-07T09:00:00.000Z","endDate":"2030-01-07T11:00:00.000Z","bookedById":555,"partySize":null}')
      expect(unit.calls[0].headers).toEqual(v116Headers('vzw-rnt-24-2030-01-07T09:00:00.000Z-31-2-555'))
    })

    test('a class entry (registerForSession)', async () => {
      const write = (pricing, promoPrice) => registerForSession(cfg, {
        sessionId: 901,
        bookedById: 555,
        notes: undefined,
        ...classExpectedTotalOf(pricing, promoPrice, null),
        idempotencyKey: withRewardKey('vzw-gc-24-901-555-0', undefined),
        reward: null,
      }, 't')

      const promo = await exchange(() => write(null, 5000))
      expect(promo.calls[0].url).toBe('https://api.example.test/api/public/businesses/24/group-class-sessions/901/register')
      expect(promo.calls[0].method).toBe('POST')
      expect(promo.calls[0].raw).toBe('{"bookedById":555,"expectedTotal":5000}')
      expect(promo.calls[0].headers).toEqual(v116Headers('vzw-gc-24-901-555-0'))
      // A quote wins over the term's promotion price; with neither, no expectedTotal.
      expect((await exchange(() => write(quote(4500), 5000))).calls[0].raw).toBe('{"bookedById":555,"expectedTotal":4500}')
      expect((await exchange(() => write(null, null))).calls[0].raw).toBe('{"bookedById":555}')
    })

    test('with a reward the total is always sent, null included', () => {
      const chosen = { fields: reward }
      expect(expectedTotalOf(quote(3000), chosen)).toEqual({ expectedTotal: 3000 })
      expect(expectedTotalOf(null, chosen)).toEqual({ expectedTotal: null })
      // The promotion price never stands in for a reward quote.
      expect(classExpectedTotalOf(null, 5000, chosen)).toEqual({ expectedTotal: null })
    })
  })

  test('a refused create keeps the fresh quote, the lines and the API sentence', async () => {
    const { result } = await exchange(
      () => createRental(cfg, { rentalTypeId: 7, startDate: 's', endDate: 'e', bookedById: 1, idempotencyKey: 'k', expectedTotal: 1, reward }, 't'),
      409,
      { code: 'REWARD_DISCOUNT_CONFLICT', message: 'Ta nagroda nie łączy się z promocją.', details: { lineIndexes: [0] }, pricing: { lines: [], total: 6400 } },
    )
    expect(result).toMatchObject({ ok: false, code: 'REWARD_DISCOUNT_CONFLICT', lineIndexes: [0], message: 'Ta nagroda nie łączy się z promocją.' })
    expect(result.pricing.total).toBe(6400)
  })

  test('a reward quote posts the selection and tells a refusal from a network error', async () => {
    const target = { flow: 'class', sessionId: 912 }
    const ok = await exchange(() => quoteWithReward(cfg, target, { rewardId: 9, lineIndexes: [0] }, 't'), 200, { lines: [], total: 0, pricingToken: 'p', reward: { rewardId: 9 } })
    expect(ok.calls[0].url).toBe('https://api.example.test/api/public/businesses/24/group-class-sessions/912/quote')
    expect(ok.calls[0].body).toEqual({ rewardSelection: { rewardId: 9, lineIndexes: [0] }, discountChoice: 'reward' })
    expect(ok.result).toMatchObject({ ok: true, quote: { pricingToken: 'p', total: 0 } })
    const refused = await exchange(() => quoteWithReward(cfg, target, { rewardId: 9, lineIndexes: [0] }, 't'), 409, { code: 'REWARD_UNAVAILABLE' })
    expect(refused.result).toEqual({ ok: false, code: 'REWARD_UNAVAILABLE' })
    globalThis.fetch = async () => { throw new Error('offline') }
    expect(await quoteWithReward(cfg, target, { rewardId: 9, lineIndexes: [0] }, 't')).toEqual({ ok: false, code: 'NETWORK' })
  })

  test('a claim carries the site key, the Bearer and the key', async () => {
    const { calls, result } = await exchange(() => claimLoyaltyReward(cfg, { catalogId: 5, idempotencyKey: 'once', pointsCost: 100 }, 't'), 201, { rewardId: 77, status: 'available' })
    expect(calls[0].url).toBe('https://api.example.test/api/public/businesses/24/loyalty/rewards/5/claim')
    expect(calls[0].headers['x-vizyto-site-key']).toBe('pk_x')
    expect(calls[0].headers.authorization).toBe('Bearer t')
    expect(calls[0].body).toEqual({ idempotencyKey: 'once', pointsCost: 100 })
    expect(result).toEqual({ ok: true, rewardId: 77 })
  })

  test('a referrals-only program counts as no program', async () => {
    const { result } = await exchange(() => getLoyaltyProgram(cfg), 200, { status: 'active', earningEnabled: false })
    expect(result).toBeNull()
    const missing = await exchange(() => getLoyaltyProgram(cfg), 404, { code: 'LOYALTY_PROGRAM_NOT_FOUND' })
    expect(missing.result).toBeNull()
  })
})
