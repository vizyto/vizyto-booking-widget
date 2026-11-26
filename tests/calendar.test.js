import { describe, expect, test } from 'bun:test'
import { DAY_PARTS, availabilityLevel, dayPartIndex, horizonMonths, monthCells } from '../src/calendar.ts'

describe('availabilityLevel: the bar of a calendar day', () => {
  test('the app\'s thresholds: 12 and 5 free starts', () => {
    expect([0, null, undefined, -1].map(availabilityLevel)).toEqual(['none', 'none', 'none', 'none'])
    expect([1, 4].map(availabilityLevel)).toEqual(['low', 'low'])
    expect([5, 11].map(availabilityLevel)).toEqual(['medium', 'medium'])
    expect([12, 40].map(availabilityLevel)).toEqual(['high', 'high'])
  })
})

describe('horizonMonths: which months the arrows page through', () => {
  test('a horizon inside one month is one month', () => {
    expect(horizonMonths(['2026-12-01', '2026-12-02', '2026-12-31'])).toEqual([{ year: 2026, month: 11 }])
  })
  test('a horizon across the new year keeps its order', () => {
    expect(horizonMonths(['2026-11-26', '2026-11-30', '2026-12-01', '2027-01-06']))
      .toEqual([{ year: 2026, month: 10 }, { year: 2026, month: 11 }, { year: 2027, month: 0 }])
  })
  test('no days, no months', () => {
    expect(horizonMonths([])).toEqual([])
  })
})

describe('monthCells: weeks wholly in the past are left out', () => {
  test('late in a month only the live weeks remain, the week of today stays whole', () => {
    // November 2026 starts on a Sunday; the 26th is a Thursday.
    const cells = monthCells(2026, 10, '2026-11-26')
    expect(cells.slice(0, 7)).toEqual(['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'])
    expect(cells.slice(7)).toEqual(['2026-11-30', '', '', '', '', '', ''])
  })
  test('a month that has not started is whole, Monday first', () => {
    const cells = monthCells(2026, 11, '2026-11-26')
    expect(cells.length).toBe(35)
    expect(cells.slice(0, 3)).toEqual(['', '2026-12-01', '2026-12-02'])
    expect(cells[cells.length - 4]).toBe('2026-12-31')
  })
  test('on the last day of a month its last week still shows', () => {
    expect(monthCells(2026, 10, '2026-11-30')).toEqual(['2026-11-30', '', '', '', '', '', ''])
  })
  test('a month wholly behind the first day keeps its last week instead of going empty', () => {
    expect(monthCells(2026, 10, '2026-12-05').length).toBe(7)
  })
})

describe('day parts: one wording and one pair of split points with the app', () => {
  test('Rano / Popołudnie / Wieczór', () => {
    expect([...DAY_PARTS]).toEqual(['Rano', 'Popołudnie', 'Wieczór'])
  })
  test('morning ends at 12:00, evening starts at 18:00', () => {
    expect([0, 11].map(dayPartIndex)).toEqual([0, 0])
    expect([12, 17].map(dayPartIndex)).toEqual([1, 1])
    expect([18, 23].map(dayPartIndex)).toEqual([2, 2])
  })
})
