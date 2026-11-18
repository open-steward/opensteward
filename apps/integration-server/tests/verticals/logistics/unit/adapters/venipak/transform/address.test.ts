import { describe, it, expect } from 'vitest'
import {
  transformAddress,
  type VenipakAddress,
} from '../../../../../../../src/verticals/logistics/adapters/venipak/transform/address'
import { AddressSchema } from '../../../../../../../src/verticals/logistics/schema/shared'

function makeAddress(overrides: Partial<VenipakAddress> = {}): VenipakAddress {
  return {
    name: 'Jonas Jonaitis',
    company_name: 'UAB Acme',
    address: 'Gedimino pr. 1',
    city: 'Vilnius',
    postcode: 'LT-01103',
    country: 'LT',
    phone: '+37060000001',
    email: 'jonas@acme.lt',
    ...overrides,
  }
}

describe('transformAddress (venipak)', () => {
  it('maps name from name field', () => {
    const result = transformAddress(makeAddress())
    expect(result?.name).toBe('Jonas Jonaitis')
  })

  it('maps company from company_name', () => {
    const result = transformAddress(makeAddress())
    expect(result?.company).toBe('UAB Acme')
  })

  it('maps street1 from address field', () => {
    const result = transformAddress(makeAddress())
    expect(result?.street1).toBe('Gedimino pr. 1')
  })

  it('maps city, postalCode, country', () => {
    const result = transformAddress(makeAddress())
    expect(result?.city).toBe('Vilnius')
    expect(result?.postalCode).toBe('LT-01103')
    expect(result?.country).toBe('LT')
  })

  it('maps phone and email', () => {
    const result = transformAddress(makeAddress())
    expect(result?.phone).toBe('+37060000001')
    expect(result?.email).toBe('jonas@acme.lt')
  })

  it('returns undefined when raw is null', () => {
    expect(transformAddress(null)).toBeUndefined()
  })

  it('returns undefined when raw is undefined', () => {
    expect(transformAddress(undefined)).toBeUndefined()
  })

  it('passes AddressSchema.parse without throwing', () => {
    const result = transformAddress(makeAddress())
    expect(() => AddressSchema.parse(result)).not.toThrow()
  })
})
