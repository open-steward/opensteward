import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawMagentoSource,
} from '../../../../../../../src/verticals/ecommerce/adapters/magento/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeSource(overrides: Partial<RawMagentoSource> = {}): RawMagentoSource {
  return {
    source_code: 'warehouse_east',
    name: 'East Coast Warehouse',
    enabled: true,
    description: 'Primary fulfillment center',
    country_id: 'US',
    region: 'NY',
    city: 'Brooklyn',
    street: '123 Example Ave',
    postcode: '11201',
    contact_name: 'Ops Team',
    email: 'ops@example.com',
    phone: '+1 555 000 1111',
    ...overrides,
  }
}

describe('transformLocation (Magento)', () => {
  it('maps source_code to id and core fields', () => {
    const result = transformLocation(makeSource())
    expect(result.id).toBe('warehouse_east')
    expect(typeof result.id).toBe('string')
    expect(result.name).toBe('East Coast Warehouse')
    expect(result.active).toBe(true)
    expect(result.phone).toBe('+1 555 000 1111')
    expect(result.isFulfillmentCenter).toBe(true)
  })

  it('maps the address block', () => {
    const result = transformLocation(makeSource())
    expect(result.address).toEqual({
      line1: '123 Example Ave',
      city: 'Brooklyn',
      region: 'NY',
      postalCode: '11201',
      country: 'US',
    })
  })

  it('omits the address block entirely when no fields are present', () => {
    const result = transformLocation(
      makeSource({
        street: undefined,
        city: undefined,
        region: undefined,
        postcode: undefined,
        country_id: undefined,
      }),
    )
    expect(result.address).toBeUndefined()
  })

  it('preserves raw payload in metadata unmodified', () => {
    const raw = makeSource()
    const result = transformLocation(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies LocationSchema', () => {
    const result = transformLocation(makeSource())
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
