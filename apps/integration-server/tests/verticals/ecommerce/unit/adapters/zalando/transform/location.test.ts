import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawZalandoLogisticCenter,
} from '../../../../../../../src/verticals/ecommerce/adapters/zalando/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeLogisticCenter(
  overrides: Partial<RawZalandoLogisticCenter> = {},
): RawZalandoLogisticCenter {
  return {
    logistic_center_id: 'lc-de-berlin-01',
    name: 'Berlin Outbound Warehouse',
    type: 'OUTBOUND_WAREHOUSE',
    address: {
      street: 'Unter den Linden 1',
      additional: 'Halle B',
      city: 'Berlin',
      zip: '10117',
      country_code: 'DE',
    },
    ...overrides,
  }
}

describe('transformLocation (Zalando)', () => {
  it('uses logistic_center_id as id', () => {
    const result = transformLocation(makeLogisticCenter())
    expect(result.id).toBe('lc-de-berlin-01')
  })

  it('maps name field', () => {
    const result = transformLocation(makeLogisticCenter())
    expect(result.name).toBe('Berlin Outbound Warehouse')
  })

  it('falls back to logistic_center_id when name is null', () => {
    const result = transformLocation(makeLogisticCenter({ name: null }))
    expect(result.name).toBe('lc-de-berlin-01')
  })

  it('always sets active to true', () => {
    const result = transformLocation(makeLogisticCenter())
    expect(result.active).toBe(true)
  })

  it('sets isFulfillmentCenter true for OUTBOUND_WAREHOUSE type', () => {
    const result = transformLocation(makeLogisticCenter({ type: 'OUTBOUND_WAREHOUSE' }))
    expect(result.isFulfillmentCenter).toBe(true)
  })

  it('leaves isFulfillmentCenter undefined for other types', () => {
    const result = transformLocation(makeLogisticCenter({ type: 'RETURNS_WAREHOUSE' }))
    expect(result.isFulfillmentCenter).toBeUndefined()
  })

  it('maps address fields correctly', () => {
    const result = transformLocation(makeLogisticCenter())
    expect(result.address).toEqual({
      line1: 'Unter den Linden 1',
      line2: 'Halle B',
      city: 'Berlin',
      postalCode: '10117',
      country: 'DE',
    })
  })

  it('maps street to line1 and zip to postalCode', () => {
    const result = transformLocation(makeLogisticCenter())
    expect(result.address?.line1).toBe('Unter den Linden 1')
    expect(result.address?.postalCode).toBe('10117')
  })

  it('returns undefined address when all address fields are absent', () => {
    const result = transformLocation(makeLogisticCenter({ address: null }))
    expect(result.address).toBeUndefined()
  })

  it('stores raw in metadata', () => {
    const raw = makeLogisticCenter()
    const result = transformLocation(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying LocationSchema', () => {
    const result = transformLocation(makeLogisticCenter())
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
