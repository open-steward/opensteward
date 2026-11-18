import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawSallaBranch,
} from '../../../../../../../src/verticals/ecommerce/adapters/salla/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeBranch(overrides: Partial<RawSallaBranch> = {}): RawSallaBranch {
  return {
    id: 10,
    name: 'Riyadh Main Branch',
    phone: '+966 11 123 4567',
    address: {
      city: 'Riyadh',
      country: 'Saudi Arabia',
      country_code: 'SA',
      address_details: 'King Fahd Road, Tower A',
      postal_code: '12345',
    },
    status: 'active',
    ...overrides,
  }
}

describe('transformLocation', () => {
  it('maps id and name', () => {
    const result = transformLocation(makeBranch())
    expect(result.id).toBe('10')
    expect(result.name).toBe('Riyadh Main Branch')
  })

  it('is active when status is active', () => {
    const result = transformLocation(makeBranch())
    expect(result.active).toBe(true)
  })

  it('active is undefined when status is not active', () => {
    const result = transformLocation(makeBranch({ status: 'inactive' }))
    expect(result.active).toBeUndefined()
  })

  it('maps address fields', () => {
    const result = transformLocation(makeBranch())
    expect(result.address?.city).toBe('Riyadh')
    expect(result.address?.country).toBe('SA')
    expect(result.address?.line1).toBe('King Fahd Road, Tower A')
    expect(result.address?.postalCode).toBe('12345')
  })

  it('maps phone', () => {
    const result = transformLocation(makeBranch())
    expect(result.phone).toBe('+966 11 123 4567')
  })

  it('isFulfillmentCenter is always true for Salla branches', () => {
    const result = transformLocation(makeBranch())
    expect(result.isFulfillmentCenter).toBe(true)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeBranch()
    const result = transformLocation(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies LocationSchema', () => {
    const result = transformLocation(makeBranch())
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
