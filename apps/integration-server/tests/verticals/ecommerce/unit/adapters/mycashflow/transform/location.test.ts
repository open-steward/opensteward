/**
 * MyCashflow Stock Location → canonical Location.
 *
 * Fixture built from the documented `Stock Location` schema examples
 * (https://support.mycashflow.com/api/#tag/Stock/operation/indexStockLocations):
 * name "London warehouse", code "london-1", created_at/updated_at
 * "2013-06-19T20:41:47+03:00".
 */
import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawMyCashflowLocation,
} from '../../../../../../../src/verticals/ecommerce/adapters/mycashflow/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeRaw(overrides: Partial<RawMyCashflowLocation> = {}): RawMyCashflowLocation {
  return {
    created_at: '2013-06-19T20:41:47+03:00',
    updated_at: '2013-06-19T20:41:47+03:00',
    name: 'London warehouse',
    code: 'london-1',
    ...overrides,
  }
}

describe('transformLocation (MyCashflow)', () => {
  it('produces a schema-valid Location from the documented example', () => {
    const result = LocationSchema.parse(transformLocation(makeRaw()))
    expect(result.id).toBe('london-1')
    expect(result.name).toBe('London warehouse')
  })

  it('uses the stock location code as the id', () => {
    expect(transformLocation(makeRaw({ code: 'helsinki-2' })).id).toBe('helsinki-2')
  })

  it('maps no field the schema does not document', () => {
    const result = transformLocation(makeRaw())
    expect(result.address).toBeUndefined()
    expect(result.phone).toBeUndefined()
    expect(result.active).toBeUndefined()
    expect(result.isFulfillmentCenter).toBeUndefined()
  })

  it('keeps the raw record in metadata', () => {
    expect(transformLocation(makeRaw()).metadata).toEqual(makeRaw())
  })

  it('throws when the record has no code rather than inventing an id', () => {
    expect(() => transformLocation(makeRaw({ code: undefined }))).toThrow(/code/)
    expect(() => transformLocation(makeRaw({ code: '' }))).toThrow(/code/)
  })
})
