import { describe, it, expect } from 'vitest'
import {
  transformAddress,
  type ShipcloudAddress,
} from '../../../../../../../src/verticals/logistics/adapters/shipcloud/transform/address'
import { AddressSchema } from '../../../../../../../src/verticals/logistics/schema/shared'

function makeAddress(overrides: Partial<ShipcloudAddress> = {}): ShipcloudAddress {
  return {
    first_name: 'Jane',
    last_name: 'Doe',
    company: 'Acme GmbH',
    street: 'Musterstraße',
    street_no: '42',
    city: 'Berlin',
    zip_code: '10115',
    state: 'BE',
    country: 'DE',
    phone: '+4930123456',
    email: 'jane.doe@acme.example',
    ...overrides,
  }
}

describe('transformAddress (shipcloud)', () => {
  it('composes full name from first_name and last_name', () => {
    expect(transformAddress(makeAddress()).name).toBe('Jane Doe')
  })

  it('falls back to company when first/last name are absent', () => {
    const result = transformAddress(makeAddress({ first_name: null, last_name: null }))
    expect(result.name).toBe('Acme GmbH')
  })

  it('concatenates street and street_no into street1', () => {
    expect(transformAddress(makeAddress()).street1).toBe('Musterstraße 42')
  })

  it('maps city, state, postalCode, country', () => {
    const result = transformAddress(makeAddress())
    expect(result.city).toBe('Berlin')
    expect(result.state).toBe('BE')
    expect(result.postalCode).toBe('10115')
    expect(result.country).toBe('DE')
  })

  it('maps phone and email', () => {
    const result = transformAddress(makeAddress())
    expect(result.phone).toBe('+4930123456')
    expect(result.email).toBe('jane.doe@acme.example')
  })

  it('maps company', () => {
    expect(transformAddress(makeAddress()).company).toBe('Acme GmbH')
  })

  it('handles all null optional fields gracefully', () => {
    const result = transformAddress({})
    expect(result.name).toBeUndefined()
    expect(result.street1).toBeUndefined()
    expect(result.city).toBeUndefined()
  })

  it('passes AddressSchema.parse without throwing', () => {
    const result = transformAddress(makeAddress())
    expect(() => AddressSchema.parse(result)).not.toThrow()
  })
})
