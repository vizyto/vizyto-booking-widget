import { describe, expect, test } from 'bun:test'
import {
  CHANNEL_REFUSAL_CODES, NEW_BOOKING_ACTIONS, classifyWriteFailure, publicChannelAllows, refusedActions, widgetAllows,
} from '../src/channel.ts'
import { createAppointment, createRental, fetchBusiness, joinWaitlist, registerForSession } from '../src/api.ts'

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

  test('682 looks open but refuses every write with a channel 409', async () => {
    const c = cfg(682)
    const b = await fetchBusiness(c)
    expect(families.map((a) => widgetAllows(b, a))).toEqual([true, true, true, true])
    const visit = await createAppointment(c, { items: [], startDate: '2030-01-07T08:00:00.000Z', bookedById: 1, idempotencyKey: 'k' }, 'mock-token')
    const cls = await registerForSession(c, { sessionId: 901, bookedById: 1, idempotencyKey: 'k' }, 'mock-token')
    const rental = await createRental(c, { resourceId: 31, startDate: '2030-01-07T08:00:00.000Z', endDate: '2030-01-08T08:00:00.000Z', bookedById: 1, idempotencyKey: 'k' }, 'mock-token')
    const wl = await joinWaitlist(c, { businessServiceId: 1, dateFrom: '2030-01-07', dateTo: '2030-01-08', bookedById: 1 }, 'mock-token')
    expect([visit, cls, rental, wl].map((r) => r.ok)).toEqual([false, false, false, false])
    expect(visit.code).toBe('CHANNEL_BOOKING_DISABLED')
    expect([cls.code, rental.code, wl.code]).toEqual(['CHANNEL_ACTION_DISABLED', 'CHANNEL_ACTION_DISABLED', 'CHANNEL_ACTION_DISABLED'])
    expect([visit, cls, rental, wl].map(classifyWriteFailure)).toEqual(['channel_closed', 'channel_closed', 'channel_closed', 'channel_closed'])
  })

  test('back on 24 the same writes go through', async () => {
    const c = cfg(24)
    await fetchBusiness(c)
    const visit = await createAppointment(c, { items: [], startDate: '2030-01-07T08:00:00.000Z', bookedById: 1, idempotencyKey: 'k' }, 'mock-token')
    expect(visit.ok).toBe(true)
  })
})
