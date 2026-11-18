import { describe, it, expect } from 'vitest'
import {
  transformAddress,
  type SendParcelAddress,
} from '../../../../../../../src/verticals/logistics/adapters/sendparcel/transform/address'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeAddress(overrides: Partial<SendParcelAddress> = {}): SendParcelAddress {
  return {
    name: 'Alice Smith',
    company: 'Acme Ltd',
    street: '123 Main St',
    street2: 'Suite 5',
    city: 'Vilnius',
    state: 'VL',
    postalCode: 'LT-01001',
    countryCode: 'LT',
    phone: '+37060000001',
    email: 'alice@example.com',
    ...overrides,
  }
}

// ─── transformAddress ─────────────────────────────────────────────────────────

describe('transformAddress', () => {
  it('maps street → street1 and countryCode → country', () => {
    const raw = makeAddress()
    const result = transformAddress(raw)
    expect(result.street1).toBe('123 Main St')
    expect(result.country).toBe('LT')
  })

  it('maps all canonical fields', () => {
    const raw = makeAddress()
    const result = transformAddress(raw)
    expect(result.name).toBe('Alice Smith')
    expect(result.company).toBe('Acme Ltd')
    expect(result.street2).toBe('Suite 5')
    expect(result.city).toBe('Vilnius')
    expect(result.state).toBe('VL')
    expect(result.postalCode).toBe('LT-01001')
    expect(result.phone).toBe('+37060000001')
    expect(result.email).toBe('alice@example.com')
  })

  it('converts null fields to undefined', () => {
    const raw = makeAddress({ name: null, company: null })
    const result = transformAddress(raw)
    expect(result.name).toBeUndefined()
    expect(result.company).toBeUndefined()
  })

  it('handles fully empty address', () => {
    const raw: SendParcelAddress = {}
    const result = transformAddress(raw)
    expect(result.street1).toBeUndefined()
    expect(result.country).toBeUndefined()
  })
})
