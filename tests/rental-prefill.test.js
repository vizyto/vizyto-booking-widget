import { describe, expect, test } from 'bun:test'
import { initialRentalOption, startingRentalOption, startingRentalUnits } from '../src/rentalPrefill.ts'

// A pool of type 7 (lanes 28 and 29) and one instance of type 8 exposed per unit,
// shaped like groupRentables() output.
const lane28 = { id: 28, name: 'Tor 1', rentalTypeId: 7, rentalUnitExposure: 'pool' }
const lane29 = { id: 29, name: 'Tor 2', rentalTypeId: 7, rentalUnitExposure: 'pool' }
const trailer31 = { id: 31, name: 'Przyczepa', rentalTypeId: 8, rentalUnitExposure: 'unit' }
const pool = { head: lane28, members: [lane28, lane29], pooled: true }
const unit = { head: trailer31, members: [trailer31], pooled: false }
const options = [unit, pool]

describe('initialRentalOption', () => {
  test('a pool type opens the pool', () => {
    expect(initialRentalOption(options, { rentalTypeId: 7 })).toBe(pool)
  })

  test('the pool type wins over a member id', () => {
    expect(initialRentalOption(options, { resourceId: 28, rentalTypeId: 7 })).toBe(pool)
  })

  test('an exposed instance opens that instance', () => {
    expect(initialRentalOption(options, { resourceId: 31 })).toBe(unit)
  })

  test('a lone pool member id leaves the list', () => {
    expect(initialRentalOption(options, { resourceId: 28 })).toBeNull()
  })

  test('an unknown type leaves the list', () => {
    expect(initialRentalOption(options, { rentalTypeId: 99 })).toBeNull()
  })

  test('a type exposed per unit falls through to the instance id', () => {
    expect(initialRentalOption(options, { rentalTypeId: 8, resourceId: 31 })).toBe(unit)
    expect(initialRentalOption(options, { rentalTypeId: 8 })).toBeNull()
  })

  test('no prefill leaves the list', () => {
    expect(initialRentalOption(options, undefined)).toBeNull()
    expect(initialRentalOption(options, {})).toBeNull()
  })

  test('the only offer is not a prefill: the host page did not choose the rental family', () => {
    expect(initialRentalOption([pool], undefined)).toBeNull()
    expect(initialRentalOption([unit], {})).toBeNull()
  })
})

describe('startingRentalOption', () => {
  test('a single pool starts on its calendar, with or without a prefill', () => {
    expect(startingRentalOption([pool], undefined)).toBe(pool)
    expect(startingRentalOption([pool], { rentalTypeId: 7 })).toBe(pool)
    // A member id or an unknown type has no list to fall back to.
    expect(startingRentalOption([pool], { resourceId: 28 })).toBe(pool)
    expect(startingRentalOption([pool], { rentalTypeId: 99 })).toBe(pool)
  })

  test('a single instance starts on its calendar', () => {
    expect(startingRentalOption([unit], undefined)).toBe(unit)
    expect(startingRentalOption([unit], { resourceId: 31 })).toBe(unit)
  })

  test('several offers start on the prefill hit, else on the list', () => {
    expect(startingRentalOption(options, { rentalTypeId: 7 })).toBe(pool)
    expect(startingRentalOption(options, { resourceId: 31 })).toBe(unit)
    expect(startingRentalOption(options, { resourceId: 28 })).toBeNull()
    expect(startingRentalOption(options, undefined)).toBeNull()
  })

  test('no offers, no pick', () => {
    expect(startingRentalOption([], undefined)).toBeNull()
    expect(startingRentalOption([], { rentalTypeId: 7 })).toBeNull()
  })
})

describe('startingRentalUnits', () => {
  test('the offer\'s minimum length, one unit without one', () => {
    expect(startingRentalUnits({ ...unit, head: { ...trailer31, rentalMinUnits: 3 } })).toBe(3)
    expect(startingRentalUnits({ ...unit, head: { ...trailer31, rentalMinUnits: 0 } })).toBe(1)
    expect(startingRentalUnits(unit)).toBe(1)
    expect(startingRentalUnits(null)).toBe(1)
  })
})
