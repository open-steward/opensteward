import { describe, it, expect } from 'vitest'
import {
  transformAddress,
  type EnviaAddress,
} from '../../../../../../../src/verticals/logistics/adapters/envia/transform/address'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeAddress(overrides: Partial<EnviaAddress> = {}): EnviaAddress {
  return {
    name: 'Jane Doe',
    company: 'Acme MX',
    phone: '+525512345678',
    email: 'jane@acme.example',
    street: 'Insurgentes Sur',
    number: '1602',
    district: 'Crédito Constructor',
    city: 'Ciudad de Mexico',
    state: 'CDMX',
    country: 'MX',
    postalCode: '03940',
    ...overrides,
  }
}

// ─── transformAddress ─────────────────────────────────────────────────────────

describe('transformAddress', () => {
  it('concatenates street + number into street1', () => {
    const result = transformAddress(makeAddress())
    // street and number joined with space — verified in source
    expect(result.street1).toBe('Insurgentes Sur 1602')
  })

  it('maps district to street2', () => {
    const result = transformAddress(makeAddress())
    // raw.district → street2 — verified in source
    expect(result.street2).toBe('Crédito Constructor')
  })

  it('maps city, state, country, postalCode directly', () => {
    const result = transformAddress(makeAddress())
    expect(result.city).toBe('Ciudad de Mexico')
    expect(result.state).toBe('CDMX')
    expect(result.country).toBe('MX')
    expect(result.postalCode).toBe('03940')
  })

  it('maps name, company, phone, email', () => {
    const result = transformAddress(makeAddress())
    expect(result.name).toBe('Jane Doe')
    expect(result.company).toBe('Acme MX')
    expect(result.phone).toBe('+525512345678')
    expect(result.email).toBe('jane@acme.example')
  })

  it('omits number when street is absent', () => {
    const result = transformAddress(makeAddress({ street: null }))
    expect(result.street1).toBeUndefined()
  })

  it('handles missing optional fields gracefully', () => {
    const result = transformAddress({
      name: null,
      company: null,
      phone: null,
      email: null,
      street: null,
      number: null,
      district: null,
      city: null,
      state: null,
      country: null,
      postalCode: null,
    })
    expect(result.name).toBeUndefined()
    expect(result.street1).toBeUndefined()
    expect(result.street2).toBeUndefined()
    expect(result.city).toBeUndefined()
  })

  it('includes street without number when number is absent', () => {
    const result = transformAddress(makeAddress({ number: null }))
    expect(result.street1).toBe('Insurgentes Sur')
  })
})
