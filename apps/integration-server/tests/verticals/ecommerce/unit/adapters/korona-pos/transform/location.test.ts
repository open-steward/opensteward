/**
 * Shape verified against `components.schemas.OrganizationalUnit` and
 * `AddressInformation` on
 * https://128.koronacloud.com/web/api/v3/openapi.json.
 */
import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type KoronaOrganizationalUnit,
} from '../../../../../../../src/verticals/ecommerce/adapters/korona-pos/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeRaw(overrides: Partial<KoronaOrganizationalUnit> = {}): KoronaOrganizationalUnit {
  return {
    id: '33333333-3333-3333-3333-333333333333',
    number: '1',
    name: 'Main Store',
    active: true,
    warehouse: true,
    address: { addressLine1: '1 Market St', city: 'San Francisco', zipCode: '94105', country: 'US' },
    ...overrides,
  }
}

describe('transformLocation (korona-pos)', () => {
  it('maps id, name, active', () => {
    const result = transformLocation(makeRaw())
    expect(result.id).toBe('33333333-3333-3333-3333-333333333333')
    expect(result.name).toBe('Main Store')
    expect(result.active).toBe(true)
  })

  it('maps warehouse directly to isFulfillmentCenter — the documented stock-holding flag', () => {
    expect(transformLocation(makeRaw({ warehouse: true })).isFulfillmentCenter).toBe(true)
    expect(transformLocation(makeRaw({ warehouse: false })).isFulfillmentCenter).toBe(false)
  })

  it('maps address fields', () => {
    const result = transformLocation(makeRaw())
    expect(result.address).toMatchObject({ line1: '1 Market St', city: 'San Francisco', postalCode: '94105', country: 'US' })
  })

  it('omits a country that is not a real ISO 3166-1 alpha-2 code', () => {
    const result = transformLocation(makeRaw({ address: { ...makeRaw().address, country: 'USA' } }))
    expect(result.address?.country).toBeUndefined()
  })

  it('produces a payload that satisfies LocationSchema', () => {
    expect(() => LocationSchema.parse(transformLocation(makeRaw()))).not.toThrow()
  })
})
