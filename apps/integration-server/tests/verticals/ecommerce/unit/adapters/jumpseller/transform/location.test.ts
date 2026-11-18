import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawJumpsellerLocation,
} from '../../../../../../../src/verticals/ecommerce/adapters/jumpseller/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

describe('transformLocation (jumpseller)', () => {
  const raw: RawJumpsellerLocation = {
    id: 3,
    name: 'Santiago Store',
    address: 'Av. Providencia 1234',
    city: 'Santiago',
    country: 'Chile',
    country_code: 'CL',
    region: 'Metropolitana',
    postal: '7500000',
    active: true,
  }

  it('maps id to string', () => {
    const result = transformLocation(raw)
    expect(result.id).toBe('3')
  })

  it('maps name', () => {
    const result = transformLocation(raw)
    expect(result.name).toBe('Santiago Store')
  })

  it('maps active = true', () => {
    const result = transformLocation(raw)
    expect(result.active).toBe(true)
  })

  it('maps address fields', () => {
    const result = transformLocation(raw)
    expect(result.address?.line1).toBe('Av. Providencia 1234')
    expect(result.address?.city).toBe('Santiago')
    // prefers country_code over country
    expect(result.address?.country).toBe('CL')
    expect(result.address?.region).toBe('Metropolitana')
    expect(result.address?.postalCode).toBe('7500000')
  })

  it('marks active location as fulfillment center', () => {
    const result = transformLocation(raw)
    expect(result.isFulfillmentCenter).toBe(true)
  })

  it('does not mark inactive location as fulfillment center', () => {
    const result = transformLocation({ ...raw, active: false })
    expect(result.active).toBe(false)
    expect(result.isFulfillmentCenter).toBeUndefined()
  })

  it('omits address when no address fields present', () => {
    const result = transformLocation({
      id: 99,
      name: 'Virtual',
      address: null,
      city: null,
      postal: null,
      country: null,
    })
    expect(result.address).toBeUndefined()
  })

  it('produces schema-valid output', () => {
    const result = transformLocation(raw)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
