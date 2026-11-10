import { afterEach, describe, expect, test } from 'bun:test'
import {
  BOOKING_CREATE_NON_SLOT_CODES, BOOKING_CREATE_NON_SLOT_PREFIXES, BUSINESS_REFUSAL_CODES, CHANNEL_REFUSAL_CODES, NEW_BOOKING_ACTIONS,
  classifyWriteFailure, isSlotRefusal, publicChannelAllows, refusedActions,
} from '../src/channel.ts'
import { createAppointment, createRental, createTableReservation, fetchBusiness, joinWaitlist, registerForSession } from '../src/api.ts'

// The external-site widget reads the `widget` slice (the default `cfg.channel`).
const widgetAllows = (business, action) => publicChannelAllows(business, 'widget', action)

// Mirrors the monorepo's packages/shared/src/utils/bookingChannels.test.ts
// ("publicChannelAllows"), so the port is held to the same contract.
describe('publicChannelAllows (port of the shared resolver)', () => {
  test('reads the channel slice, falls back to the old switch on an older API', () => {
    const business = { hasWebsiteReservationsEnabled: true, bookingChannels: { client_app: { enabled: false, actions: { book: false, cancel: true } } } }
    expect(publicChannelAllows(business, 'client_app', 'book')).toBe(false)
    expect(publicChannelAllows(business, 'client_app', 'cancel')).toBe(true)
    expect(publicChannelAllows({ hasWebsiteReservationsEnabled: false }, 'website', 'book')).toBe(false)
    expect(publicChannelAllows({ hasWebsiteReservationsEnabled: false }, 'website', 'cancel')).toBe(true)
    expect(publicChannelAllows({ hasWebsiteReservationsEnabled: false }, 'website', 'groupClasses')).toBe(true)
    expect(publicChannelAllows(null, 'website', 'book')).toBe(false)
  })

  test('the widget reads only its own slice', () => {
    const business = {
      hasWebsiteReservationsEnabled: true,
      bookingChannels: {
        website: { enabled: true, actions: { book: true, groupClasses: true } },
        widget: { enabled: false, actions: { book: false, groupClasses: true } },
      },
    }
    expect(widgetAllows(business, 'book')).toBe(false)
    expect(widgetAllows(business, 'groupClasses')).toBe(true)
    // An action missing from a present slice is closed, not open.
    expect(widgetAllows(business, 'rentals')).toBe(false)
    // vizyto.com's guest page (`channel: 'website'`) reads the other slice.
    expect(publicChannelAllows(business, 'website', 'book')).toBe(true)
    expect(publicChannelAllows(business, 'website', 'rentals')).toBe(false)
  })

  test('a profile without the widget slice falls back to the business switch', () => {
    const business = { hasWebsiteReservationsEnabled: true, bookingChannels: { website: { enabled: false, actions: {} } } }
    expect(widgetAllows(business, 'book')).toBe(true)
    expect(widgetAllows({ ...business, hasWebsiteReservationsEnabled: false }, 'book')).toBe(false)
    expect(widgetAllows({ ...business, hasWebsiteReservationsEnabled: false }, 'rentals')).toBe(true)
  })
})

describe('classifyWriteFailure (409 mapping)', () => {
  test('both channel refusals map to the closed state, never to a lost slot', () => {
    expect(classifyWriteFailure({ code: 'CHANNEL_BOOKING_DISABLED' })).toBe('channel_closed')
    expect(classifyWriteFailure({ code: 'CHANNEL_ACTION_DISABLED' })).toBe('channel_closed')
    expect([...CHANNEL_REFUSAL_CODES].sort()).toEqual(['CHANNEL_ACTION_DISABLED', 'CHANNEL_BOOKING_DISABLED'])
  })

  test('the other outcomes keep their own recovery', () => {
    expect(classifyWriteFailure({ code: 'PRICE_CHANGED', pricing: { total: 100 } })).toBe('price_changed')
    // A price change without the new price cannot be shown, so it is a plain refusal.
    expect(classifyWriteFailure({ code: 'PRICE_CHANGED' })).toBe('refused')
    for (const code of ['BOOKED_BY_MISMATCH', 'VERIFICATION_REQUIRED', 'PHONE_VERIFICATION_REQUIRED']) {
      expect(classifyWriteFailure({ code })).toBe('verification')
    }
    expect(classifyWriteFailure({ code: 'BOOKING_ACCESS_RESTRICTED' })).toBe('access_restricted')
    expect(classifyWriteFailure({ code: 'NETWORK' })).toBe('network')
    expect(classifyWriteFailure({ code: 'SLOT_TAKEN' })).toBe('refused')
    expect(classifyWriteFailure({ code: 'HTTP_409' })).toBe('refused')
  })

  test('a business that takes no bookings at all is closed, never a lost slot', () => {
    expect([...BUSINESS_REFUSAL_CODES].sort()).toEqual(['BUSINESS_CLOSED', 'SUBSCRIPTION_REQUIRED'])
    expect(classifyWriteFailure({ code: 'BUSINESS_CLOSED', status: 409 })).toBe('business_closed')
    expect(classifyWriteFailure({ code: 'SUBSCRIPTION_REQUIRED', status: 402 })).toBe('business_closed')
    expect(classifyWriteFailure({ code: 'SUBSCRIPTION_REQUIRED' })).toBe('business_closed')
  })

  test('a server error, a body without the API\'s code or a request the API could not take is a failure, not a refusal', () => {
    // Whatever the body of a 5xx says.
    for (const code of ['INTERNAL_SERVER_ERROR', 'HTTP_502', 'SLOT_TAKEN', 'CHANNEL_BOOKING_DISABLED']) {
      expect(classifyWriteFailure({ code, status: 503 })).toBe('failed')
    }
    expect(classifyWriteFailure({ code: 'HTTP_500', status: 500 })).toBe('failed')
    // A proxy's page on a 4xx carries no code: nothing the API refused.
    expect(classifyWriteFailure({ code: 'HTTP_403', status: 403 })).toBe('failed')
    expect(classifyWriteFailure({ code: 'HTTP_429', status: 429 })).toBe('failed')
    for (const code of ['PARSE', 'VALIDATION', 'INVALID_PARAMETER', 'INVALID_COOKIE_SIGNATURE', 'SITE_KEY_REQUIRED', 'IDEMPOTENCY_KEY_REUSED']) {
      expect(classifyWriteFailure({ code, status: 409 })).toBe('failed')
    }
    // A 409 without a code is still a refusal (a lost slot for a visit), as in the monorepo.
    expect(classifyWriteFailure({ code: 'HTTP_409', status: 409 })).toBe('refused')
    // A named refusal of the term keeps each path's own recovery.
    expect(classifyWriteFailure({ code: 'SESSION_FULL', status: 409 })).toBe('refused')
    expect(classifyWriteFailure({ code: 'INCOMPLETE_PROFILE', status: 422 })).toBe('refused')
  })
})

// Mirrors the monorepo's packages/shared/src/utils/bookingCreateErrors.test.ts.
describe('isSlotRefusal (port of isBookingSlotRefusal, #543)', () => {
  test('every 409 slot reason from create is a lost slot, engine codes included', () => {
    for (const code of [
      'CART_ITEM_NOT_AVAILABLE', 'DATE_RANGE_NOT_AVAILABLE', 'NO_AVAILABLE_RESOURCE',
      'APPOINTMENT_OUTSIDE_RESOURCE_WORKING_HOURS', 'APPOINTMENT_TIME_BLOCK_CONFLICT', 'APPOINTMENT_SOMETHING_NEW', 'HTTP_409',
    ]) {
      expect(isSlotRefusal({ code, status: 409 })).toBe(true)
    }
  })

  test('codes answered on their own are not a lost slot', () => {
    for (const code of [
      ...BOOKING_CREATE_NON_SLOT_CODES,
      'REWARD_QUOTE_EXPIRED', 'REWARD_DISCOUNT_CONFLICT', 'REWARD_UNAVAILABLE', 'LOYALTY_PROGRAM_PAUSED', 'LOYALTY_PLAN_REQUIRED',
      'GIFT_CARD_UNAVAILABLE', 'GIFT_CARD_PASS_CONFLICT', 'PASS_EXPIRED', 'PASS_NO_ENTRIES_LEFT',
    ]) {
      expect(isSlotRefusal({ code, status: 409 })).toBe(false)
    }
    // The port, code for code.
    expect([...BOOKING_CREATE_NON_SLOT_CODES].sort()).toEqual([
      'BOOKED_BY_MISMATCH', 'BOOKING_ACCESS_RESTRICTED', 'BUSINESS_CLOSED', 'CHANNEL_ACTION_DISABLED', 'CHANNEL_BOOKING_DISABLED',
      'IDEMPOTENCY_KEY_REUSED', 'INCOMPLETE_PROFILE', 'PHONE_VERIFICATION_REQUIRED', 'PRICE_CHANGED', 'SITE_KEY_REQUIRED',
      'SUBSCRIPTION_REQUIRED', 'VERIFICATION_REQUIRED',
    ])
    expect(BOOKING_CREATE_NON_SLOT_PREFIXES).toEqual(['REWARD_', 'LOYALTY_', 'PASS_', 'GIFT_CARD_'])
  })

  test('other statuses never count, whatever the code', () => {
    expect(isSlotRefusal({ code: 'INTERNAL_SERVER_ERROR', status: 500 })).toBe(false)
    expect(isSlotRefusal({ code: 'CART_EMPTY', status: 422 })).toBe(false)
    expect(isSlotRefusal({ code: 'DATE_RANGE_NOT_AVAILABLE', status: 403 })).toBe(false)
    expect(isSlotRefusal({ code: 'RESOURCE_NOT_ONLINE_BOOKABLE', status: 400 })).toBe(false)
  })

  test('a result without a status (the mock) is read by its code; no connection is never a lost slot', () => {
    expect(isSlotRefusal({ code: 'SLOT_TAKEN' })).toBe(true)
    expect(isSlotRefusal({ code: 'CHANNEL_ACTION_DISABLED' })).toBe(false)
    expect(isSlotRefusal({ code: 'NETWORK' })).toBe(false)
  })
})

describe('refused creates as the HTTP layer reads them', () => {
  const realFetch = globalThis.fetch
  afterEach(() => { globalThis.fetch = realFetch })
  const cfg = { apiBase: 'https://api.example.test', siteKey: 'pk_x', businessId: 24, channel: 'widget' }
  const answer = (status, body, type = 'application/json') => {
    globalThis.fetch = async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': type } })
  }
  const writes = [
    ['visit', () => createAppointment(cfg, { items: [], startDate: 's', bookedById: 1, idempotencyKey: 'k' }, 't')],
    ['class', () => registerForSession(cfg, { sessionId: 1, bookedById: 1, idempotencyKey: 'k' }, 't')],
    ['rental', () => createRental(cfg, { resourceId: 31, startDate: 's', endDate: 'e', bookedById: 1, idempotencyKey: 'k' }, 't')],
    ['table', () => createTableReservation(cfg, { bookedById: 1, startAt: 's', adults: 2, children: 0, idempotencyKey: 'k' }, 't')],
  ]

  test('a proxy\'s error page (not JSON) is a failure with its status and no text', async () => {
    for (const [, write] of writes) {
      answer(502, '<html><body>Bad Gateway</body></html>', 'text/html')
      const r = await write()
      expect(r).toMatchObject({ ok: false, code: 'HTTP_502', status: 502 })
      expect(r.message).toBeUndefined()
      expect(classifyWriteFailure(r)).toBe('failed')
    }
  })

  test('the API\'s 500 envelope is a failure, its English text left unused', async () => {
    for (const [, write] of writes) {
      answer(500, { status: 'error', code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' })
      const r = await write()
      expect(r).toMatchObject({ ok: false, status: 500 })
      expect(classifyWriteFailure(r)).toBe('failed')
    }
  })

  test('a channel or business refusal of a visit is no lost slot', async () => {
    answer(409, { code: 'CHANNEL_BOOKING_DISABLED', message: 'Ta firma nie przyjmuje tu nowych rezerwacji. Skontaktuj się z nią bezpośrednio.' })
    let r = await writes[0][1]()
    expect([classifyWriteFailure(r), isSlotRefusal(r)]).toEqual(['channel_closed', false])
    answer(409, { code: 'BUSINESS_CLOSED', message: 'Ten biznes nie przyjmuje nowych rezerwacji.' })
    r = await writes[0][1]()
    expect([classifyWriteFailure(r), isSlotRefusal(r)]).toEqual(['business_closed', false])
    for (const [, write] of writes) {
      answer(402, { code: 'SUBSCRIPTION_REQUIRED', message: 'Ten biznes nie przyjmuje teraz rezerwacji online. Skontaktuj się z nim bezpośrednio.' })
      expect(classifyWriteFailure(await write())).toBe('business_closed')
    }
  })

  test('a 409 about the term is a lost slot; a profile without a name is not', async () => {
    answer(409, { code: 'APPOINTMENT_CONFLICT_WITH_RENTAL', message: 'Ten termin nie jest już dostępny. Wybierz inną godzinę.' })
    let r = await writes[0][1]()
    expect([classifyWriteFailure(r), isSlotRefusal(r)]).toEqual(['refused', true])
    answer(422, { code: 'INCOMPLETE_PROFILE', message: 'Uzupełnij imię, nazwisko i numer telefonu w profilu, aby zarezerwować wizytę.' })
    r = await writes[0][1]()
    expect([classifyWriteFailure(r), isSlotRefusal(r)]).toEqual(['refused', false])
  })
})

describe('refusedActions', () => {
  test('an action refusal closes that action only', () => {
    expect(refusedActions('groupClasses', 'CHANNEL_ACTION_DISABLED')).toEqual(['groupClasses'])
    expect(refusedActions('waitlist', 'CHANNEL_ACTION_DISABLED')).toEqual(['waitlist'])
  })

  test('online booking off closes visits; a channel switched off closes every new booking', () => {
    expect(refusedActions('book', 'CHANNEL_BOOKING_DISABLED')).toEqual(['book'])
    expect(refusedActions('rentals', 'CHANNEL_BOOKING_DISABLED')).toEqual([...NEW_BOOKING_ACTIONS])
  })
})

// Mock-mode smoke: the levers documented in the README behave as the API would.
describe('mock channel levers', () => {
  const cfg = (businessId) => ({ apiBase: 'mock', siteKey: '', businessId, mock: true })
  const families = ['book', 'groupClasses', 'rentals', 'waitlist']

  test('24 is open in the widget channel', async () => {
    const b = await fetchBusiness(cfg(24))
    expect(families.map((a) => widgetAllows(b, a))).toEqual([true, true, true, true])
  })

  test('680 has the widget channel switched off', async () => {
    const b = await fetchBusiness(cfg(680))
    expect(families.map((a) => widgetAllows(b, a))).toEqual([false, false, false, false])
    // Other channels are untouched.
    expect(publicChannelAllows(b, 'website', 'book')).toBe(true)
  })

  test('681 closes classes and the waitlist only', async () => {
    const b = await fetchBusiness(cfg(681))
    expect(families.map((a) => widgetAllows(b, a))).toEqual([true, false, true, false])
  })

  const writeAll = (c) => Promise.all([
    createAppointment(c, { items: [], startDate: '2030-01-07T08:00:00.000Z', bookedById: 1, idempotencyKey: 'k' }, 'mock-token'),
    registerForSession(c, { sessionId: 901, bookedById: 1, idempotencyKey: 'k' }, 'mock-token'),
    createRental(c, { resourceId: 31, startDate: '2030-01-07T08:00:00.000Z', endDate: '2030-01-08T08:00:00.000Z', bookedById: 1, idempotencyKey: 'k' }, 'mock-token'),
    joinWaitlist(c, { businessServiceId: 1, dateFrom: '2030-01-07', dateTo: '2030-01-08', bookedById: 1 }, 'mock-token'),
  ])

  test('682 looks open, then answers like a channel switched off after load', async () => {
    const c = cfg(682)
    const b = await fetchBusiness(c)
    expect(families.map((a) => widgetAllows(b, a))).toEqual([true, true, true, true])
    const writes = await writeAll(c)
    expect(writes.map((r) => r.ok)).toEqual([false, false, false, false])
    // A closed channel refuses every new booking with the same code (policy.service.ts).
    expect(writes.map((r) => r.code)).toEqual(Array(4).fill('CHANNEL_BOOKING_DISABLED'))
    expect(writes.map(classifyWriteFailure)).toEqual(Array(4).fill('channel_closed'))
    // The re-read the widget makes after a channel 409 sees the closed channel.
    const fresh = await fetchBusiness(c)
    expect(families.map((a) => widgetAllows(fresh, a))).toEqual([false, false, false, false])
  })

  test('683 switches actions off one by one', async () => {
    const c = cfg(683)
    const b = await fetchBusiness(c)
    expect(families.map((a) => widgetAllows(b, a))).toEqual([true, true, true, true])
    const visit = await createAppointment(c, { items: [], startDate: '2030-01-07T08:00:00.000Z', bookedById: 1, idempotencyKey: 'k' }, 'mock-token')
    expect(visit.code).toBe('CHANNEL_ACTION_DISABLED')
    expect(refusedActions('book', visit.code)).toEqual(['book'])
    const fresh = await fetchBusiness(c)
    expect(families.map((a) => widgetAllows(fresh, a))).toEqual([false, true, true, true])
  })

  test('back on 24 the same writes go through', async () => {
    const c = cfg(24)
    await fetchBusiness(c)
    const visit = await createAppointment(c, { items: [], startDate: '2030-01-07T08:00:00.000Z', bookedById: 1, idempotencyKey: 'k' }, 'mock-token')
    expect(visit.ok).toBe(true)
  })
})
