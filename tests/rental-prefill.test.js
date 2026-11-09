import { describe, expect, test } from 'bun:test'
import { initialRentalOption } from '../src/rentalPrefill.ts'

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
})
