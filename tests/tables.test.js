import { describe, expect, test } from 'bun:test'
import {
  anyGrey, childrenLine, countsWindow, holdRule, partyGenitive, partyRange, tableDayEmpty, tableDayOver,
  tableErrorMessage, tableIdempotencyKey, tablePartyLabel, tablesBookable, tableWaitlistErrorMessage, visiblePeriods,
} from '../src/tables.ts'

const slot = (time, available, reason) => ({ startAt: `2026-11-05T${time}:00+01:00`, time, available, ...(reason ? { reason } : {}) })
const period = (periodId, slots) => ({ periodId, name: `P${periodId}`, lastSeating: '21:00', slots })

describe('tablesBookable', () => {
  test('needs the tables capability and an active plan', () => {
    expect(tablesBookable({ capabilities: ['tables'] })).toBe(true)
    expect(tablesBookable({ capabilities: ['tables'], bookingSuspended: false })).toBe(true)
    expect(tablesBookable({})).toBe(false)
    expect(tablesBookable({ capabilities: ['rentals'] })).toBe(false)
    expect(tablesBookable({ capabilities: ['tables'], bookingSuspended: true })).toBe(false)
    expect(tablesBookable(null)).toBe(false)
  })
})

describe('party limits', () => {
  test('API limits without options, the venue limits with them', () => {
    expect(partyRange(null)).toEqual({ maxAdults: 10, maxChildren: 4 })
    expect(partyRange({ maxAdults: 6, maxChildren: 2 })).toEqual({ maxAdults: 6, maxChildren: 2 })
  })
})

describe('day states', () => {
  const day = {
    periods: [
      period(1, [slot('12:00', false, 'past'), slot('12:30', false, 'past')]),
      period(2, [slot('18:00', false, 'past'), slot('18:30', true), slot('19:00', false, 'taken')]),
    ],
  }

  test('past starts and then empty periods are dropped', () => {
    const shown = visiblePeriods(day)
    expect(shown.map((p) => p.periodId)).toEqual([2])
    expect(shown[0].slots.map((s) => s.time)).toEqual(['18:30', '19:00'])
    expect(anyGrey(shown)).toBe(true)
    expect(anyGrey([period(3, [slot('20:00', true)])])).toBe(false)
    expect(visiblePeriods(null)).toEqual([])
  })

  test('empty and over', () => {
    expect(tableDayEmpty(day)).toBe(false)
    expect(tableDayEmpty({ periods: [period(1, [slot('19:00', false, 'taken')])] })).toBe(true)
    expect(tableDayEmpty({ periods: [] })).toBe(true)
    expect(tableDayEmpty(null)).toBe(false)
    expect(tableDayOver(day.periods)).toBe(false)
    expect(tableDayOver([period(1, [slot('12:00', false, 'past')])])).toBe(true)
    expect(tableDayOver([])).toBe(false)
  })
})

describe('messages', () => {
  test('a table refusal shows the API message first, the local text without one', () => {
    expect(tableErrorMessage('TABLE_NOT_AVAILABLE', 'Brak wolnego stolika dla tej liczby osób o tej godzinie. Wybierz inną godzinę.'))
      .toBe('Brak wolnego stolika dla tej liczby osób o tej godzinie. Wybierz inną godzinę.')
    expect(tableErrorMessage('TABLE_NOT_AVAILABLE')).toBe('O tej godzinie nie ma już wolnego stolika. Wybierz inną.')
    expect(tableErrorMessage('TABLE_TOO_LATE')).toBe('Na tę godzinę nie można już zarezerwować stolika. Wybierz inną.')
    expect(tableErrorMessage('TABLE_OUTSIDE_SERVICE')).toBe('O tej godzinie lokal nie przyjmuje rezerwacji. Wybierz inną.')
    // Non-table codes never surface a raw API string.
    expect(tableErrorMessage('HTTP_422', 'Expected integer')).toBe('Nie udało się zarezerwować stolika. Spróbuj ponownie.')
  })

  test('waitlist refusals', () => {
    expect(tableWaitlistErrorMessage('WAITLIST_DUPLICATE')).toBe('Już czekasz na stolik w tym dniu.')
    expect(tableWaitlistErrorMessage('WAITLIST_LIMIT_REACHED')).toBe('Masz już 3 aktywne zapisy w tym lokalu - usuń któryś w profilu Vizyto, aby dodać nowy.')
    expect(tableWaitlistErrorMessage('WAITLIST_DISABLED')).toBe('Ten lokal nie prowadzi listy oczekujących.')
    expect(tableWaitlistErrorMessage('NETWORK')).toBe('Brak połączenia. Spróbuj ponownie.')
  })

  test('Polish counts', () => {
    expect([1, 2, 5, 12, 22].map(tablePartyLabel)).toEqual(['1 osoba', '2 osoby', '5 osób', '12 osób', '22 osoby'])
    expect([1, 2, 5].map(partyGenitive)).toEqual(['1 osoby', '2 osób', '5 osób'])
    expect(childrenLine(1)).toBe('w tym 1 dziecko')
    expect(childrenLine(2)).toBe('w tym 2 dzieci')
    expect(holdRule(1)).toBe('Lokal trzyma stolik 1 minutę po godzinie rezerwacji.')
    expect(holdRule(2)).toBe('Lokal trzyma stolik 2 minuty po godzinie rezerwacji.')
    expect(holdRule(5)).toBe('Lokal trzyma stolik 5 minut po godzinie rezerwacji.')
    expect(holdRule(15)).toBe('Lokal trzyma stolik 15 minut po godzinie rezerwacji.')
  })
})

describe('tableIdempotencyKey', () => {
  const base = { businessId: 24, startAt: '2026-11-05T19:00:00+01:00', adults: 2, children: 0, zoneId: null, userId: 7 }
  test('stable for one reservation, different for another', () => {
    expect(tableIdempotencyKey(base)).toBe(tableIdempotencyKey({ ...base }))
    expect(tableIdempotencyKey(base)).toBe('vzw-tbl-24-2026-11-05T19:00:00+01:00-2-0-any-7')
    for (const change of [{ adults: 3 }, { children: 1 }, { zoneId: 2 }, { startAt: '2026-11-05T19:30:00+01:00' }, { userId: 8 }]) {
      expect(tableIdempotencyKey({ ...base, ...change })).not.toBe(tableIdempotencyKey(base))
    }
  })
})

describe('countsWindow', () => {
  test('42 days become ranges of at most 31 days', () => {
    const days = Array.from({ length: 42 }, (_, i) => `d${String(i).padStart(2, '0')}`)
    expect(countsWindow(days)).toEqual([{ from: 'd00', to: 'd30' }, { from: 'd31', to: 'd41' }])
    expect(countsWindow(days.slice(0, 31))).toEqual([{ from: 'd00', to: 'd30' }])
    expect(countsWindow([])).toEqual([])
  })
})
