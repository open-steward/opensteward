import { describe, it, expect } from 'vitest'
import {
  transformAddress,
  type ChazkiAddress,
} from '../../../../../../../src/verticals/logistics/adapters/chazki/transform/address'
import { AddressSchema } from '../../../../../../../src/verticals/logistics/schema/shared'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeAddress(overrides: Partial<ChazkiAddress> = {}): ChazkiAddress {
  return {
    name: 'Alice',
    company: 'Acme',
    address_line1: '123 Main St',
    address_line2: 'Suite 1',
    city: 'Lima',
    state: 'Lima Region',
    postal_code: '15000',
    country_code: 'PE',
    phone: '+511234567',
    email: 'alice@example.com',
    ...overrides,
  }
}

// ─── Core field mapping ───────────────────────────────────────────────────────

describe('transformAddress', () => {
  it('maps all core fields correctly', () => {
    const result = transformAddress(makeAddress())

    expect(result.name).toBe('Alice')
    expect(result.company).toBe('Acme')
    expect(result.street1).toBe('123 Main St')
    expect(result.street2).toBe('Suite 1')
    expect(result.city).toBe('Lima')
    expect(result.state).toBe('Lima Region')
    expect(result.postalCode).toBe('15000')
    expect(result.country).toBe('PE')
    expect(result.phone).toBe('+511234567')
    expect(result.email).toBe('alice@example.com')
  })

  it('passes AddressSchema validation', () => {
    const result = transformAddress(makeAddress())
    expect(() => AddressSchema.parse(result)).not.toThrow()
  })

  // ─── Name fallback ───────────────────────────────────────────────────────────

  it('falls back to reference_name when name is null', () => {
    const result = transformAddress(makeAddress({ name: null, reference_name: 'RefAlice' }))
    expect(result.name).toBe('RefAlice')
  })

  it('returns undefined name when name and reference_name are both null', () => {
    const result = transformAddress(makeAddress({ name: null, reference_name: null }))
    expect(result.name).toBeUndefined()
  })

  // ─── Street1 fallback ────────────────────────────────────────────────────────

  it('falls back to address when address_line1 is null', () => {
    const result = transformAddress(makeAddress({ address_line1: null, address: '789 Backup Rd' }))
    expect(result.street1).toBe('789 Backup Rd')
  })

  it('returns undefined street1 when address_line1 and address are both null', () => {
    const result = transformAddress(makeAddress({ address_line1: null, address: null }))
    expect(result.street1).toBeUndefined()
  })

  // ─── City fallback ───────────────────────────────────────────────────────────

  it('falls back to district when city is null', () => {
    const result = transformAddress(makeAddress({ city: null, district: 'Miraflores' }))
    expect(result.city).toBe('Miraflores')
  })

  it('returns undefined city when city and district are both null', () => {
    const result = transformAddress(makeAddress({ city: null, district: null }))
    expect(result.city).toBeUndefined()
  })

  // ─── State fallback ──────────────────────────────────────────────────────────

  it('falls back to region when state is null', () => {
    const result = transformAddress(makeAddress({ state: null, region: 'Lima Province' }))
    expect(result.state).toBe('Lima Province')
  })

  it('returns undefined state when state and region are both null', () => {
    const result = transformAddress(makeAddress({ state: null, region: null }))
    expect(result.state).toBeUndefined()
  })

  // ─── Postal code fallback ────────────────────────────────────────────────────

  it('falls back to zip when postal_code is null', () => {
    const result = transformAddress(makeAddress({ postal_code: null, zip: '15100' }))
    expect(result.postalCode).toBe('15100')
  })

  it('returns undefined postalCode when postal_code and zip are both null', () => {
    const result = transformAddress(makeAddress({ postal_code: null, zip: null }))
    expect(result.postalCode).toBeUndefined()
  })

  // ─── Country fallback ────────────────────────────────────────────────────────

  it('falls back to country when country_code is null', () => {
    const result = transformAddress(makeAddress({ country_code: null, country: 'PE' }))
    expect(result.country).toBe('PE')
  })

  it('returns undefined country when country_code and country are both null', () => {
    const result = transformAddress(makeAddress({ country_code: null, country: null }))
    expect(result.country).toBeUndefined()
  })

  // ─── Phone fallback ──────────────────────────────────────────────────────────

  it('falls back to phone_number when phone is null', () => {
    const result = transformAddress(makeAddress({ phone: null, phone_number: '+519876543' }))
    expect(result.phone).toBe('+519876543')
  })

  it('returns undefined phone when phone and phone_number are both null', () => {
    const result = transformAddress(makeAddress({ phone: null, phone_number: null }))
    expect(result.phone).toBeUndefined()
  })

  // ─── Optional company/email ──────────────────────────────────────────────────

  it('returns undefined company when company is null', () => {
    const result = transformAddress(makeAddress({ company: null }))
    expect(result.company).toBeUndefined()
  })

  it('returns undefined email when email is null', () => {
    const result = transformAddress(makeAddress({ email: null }))
    expect(result.email).toBeUndefined()
  })

  // ─── street2 ─────────────────────────────────────────────────────────────────

  it('returns undefined street2 when address_line2 is null', () => {
    const result = transformAddress(makeAddress({ address_line2: null }))
    expect(result.street2).toBeUndefined()
  })
})
