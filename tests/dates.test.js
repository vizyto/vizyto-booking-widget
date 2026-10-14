import { describe, expect, test } from 'bun:test'
import { rentalSlotStartIso, zonedDay, zonedIso } from '../src/dates.ts'
import { getRentalDaySlots } from '../src/mock.ts'
import { rentalUnitsLabel, slotStartDate } from '../src/api.ts'

const WAW = 'Europe/Warsaw'

// Poland in 2026: CEST (UTC+2) from Sunday 29 March 01:00Z to Sunday 25 October
// 01:00Z, CET (UTC+1) outside it.
describe('zonedIso: a business wall-clock time to a UTC instant', () => {
  test('either side of the March change', () => {
    expect(zonedIso('2026-03-28', '10:00', WAW)).toBe('2026-03-28T09:00:00.000Z')
    expect(zonedIso('2026-03-29', '10:00', WAW)).toBe('2026-03-29T08:00:00.000Z')
    // Right around the jump: 01:00 is still winter, 03:00 already summer.
    expect(zonedIso('2026-03-29', '01:00', WAW)).toBe('2026-03-29T00:00:00.000Z')
    expect(zonedIso('2026-03-29', '03:00', WAW)).toBe('2026-03-29T01:00:00.000Z')
  })

  test('either side of the October change', () => {
    expect(zonedIso('2026-10-24', '10:00', WAW)).toBe('2026-10-24T08:00:00.000Z')
    expect(zonedIso('2026-10-25', '10:00', WAW)).toBe('2026-10-25T09:00:00.000Z')
    expect(zonedIso('2026-10-25', '04:00', WAW)).toBe('2026-10-25T03:00:00.000Z')
  })

  test('zonedDay reads the local calendar day', () => {
    expect(zonedDay(Date.parse('2026-10-24T22:30:00.000Z'), WAW)).toBe('2026-10-25')
    expect(zonedDay(Date.parse('2026-10-25T22:30:00.000Z'), WAW)).toBe('2026-10-25')
  })
})

describe('rentalSlotStartIso: the pickup of a picked hour tile', () => {
  test('converts the wall-clock tile in the business timezone, never glues it to Z', () => {
    expect(rentalSlotStartIso('2026-03-28', '10:00', WAW)).toBe('2026-03-28T09:00:00.000Z')
    expect(rentalSlotStartIso('2026-03-29', '10:00', WAW)).toBe('2026-03-29T08:00:00.000Z')
    expect(rentalSlotStartIso('2026-10-24', '10:00', WAW)).toBe('2026-10-24T08:00:00.000Z')
    expect(rentalSlotStartIso('2026-10-25', '10:00', WAW)).toBe('2026-10-25T09:00:00.000Z')
    expect(rentalSlotStartIso('2026-10-25', '10:00', WAW)).not.toBe('2026-10-25T10:00:00.000Z')
  })

  test('the tile\'s own instant wins when it belongs to the day', () => {
    // The repeated hour on the October night: the API knows which 02:30 it meant.
    const slots = [{ start: '2026-10-25T01:30:00.000Z', local: '02:30' }]
    expect(rentalSlotStartIso('2026-10-25', '02:30', WAW, slots)).toBe('2026-10-25T01:30:00.000Z')
  })

  test('a tile left over from another day does not lend its instant', () => {
    const stale = [{ start: '2026-10-24T08:00:00.000Z', local: '10:00' }]
    expect(rentalSlotStartIso('2026-10-25', '10:00', WAW, stale)).toBe('2026-10-25T09:00:00.000Z')
  })

  test('no tile picked, or an unknown zone: no window', () => {
    expect(rentalSlotStartIso('2026-10-25', '', WAW)).toBeNull()
    expect(rentalSlotStartIso('2026-10-25', '10:00', 'Mars/Olympus')).toBeNull()
  })

  test('the mock grid publishes real instants, like the API', async () => {
    const grid = await getRentalDaySlots({ rentalTypeId: 7, date: '2026-10-24' })
    expect(grid.mode).toBe('slots')
    const ten = grid.slots.find((s) => s.local === '10:00')
    expect(ten.start).toBe('2026-10-24T08:00:00.000Z')
    expect(rentalSlotStartIso('2026-10-24', '10:00', WAW, grid.slots)).toBe('2026-10-24T08:00:00.000Z')
  })
})

describe('slotStartDate: a visit UTC key on its local day', () => {
  test('a daytime key stays on the date', () => {
    expect(slotStartDate('2026-10-24', '08:00', WAW)).toBe('2026-10-24T08:00:00.000Z')
    expect(slotStartDate('2026-10-25', '09:00', WAW)).toBe('2026-10-25T09:00:00.000Z')
  })

  test('a key after local midnight belongs to the UTC day before', () => {
    // 00:30 in Warsaw on 24 October (CEST) is 22:30Z on the 23rd.
    expect(slotStartDate('2026-10-24', '22:30', WAW)).toBe('2026-10-23T22:30:00.000Z')
    // In winter the same local 00:30 is 23:30Z.
    expect(slotStartDate('2026-10-26', '23:30', WAW)).toBe('2026-10-25T23:30:00.000Z')
  })

  test('without a zone (labels) the key is glued to the date', () => {
    expect(slotStartDate('2026-10-24', '22:30')).toBe('2026-10-24T22:30:00.000Z')
  })
})

describe('rentalUnitsLabel after "od"', () => {
  test('1 takes the genitive singular, every other count the genitive plural', () => {
    expect(rentalUnitsLabel(1, 'day', 'od')).toBe('1 doby')
    expect(rentalUnitsLabel(2, 'day', 'od')).toBe('2 dób')
    expect(rentalUnitsLabel(3, 'hour', 'od')).toBe('3 godzin')
    expect(rentalUnitsLabel(4, 'week', 'od')).toBe('4 tygodni')
    expect(rentalUnitsLabel(5, 'month', 'od')).toBe('5 miesięcy')
    expect(rentalUnitsLabel(12, 'minute', 'od')).toBe('12 minut')
    expect(rentalUnitsLabel(22, 'day', 'od')).toBe('22 dób')
  })

  test('without "od" the counted forms are unchanged', () => {
    expect(rentalUnitsLabel(1, 'day')).toBe('1 doba')
    expect(rentalUnitsLabel(2, 'day')).toBe('2 doby')
    expect(rentalUnitsLabel(5, 'day')).toBe('5 dób')
    expect(rentalUnitsLabel(22, 'week')).toBe('22 tygodnie')
  })
})
