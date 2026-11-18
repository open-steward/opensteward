import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type PayhawkSupplier,
} from '../../../../../../../src/verticals/accounting/adapters/payhawk/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeRaw(overrides: Partial<PayhawkSupplier> = {}): PayhawkSupplier {
  return {
    id: 'supp-1',
    name: 'ACME Corp',
    vatNumber: 'DE123456789',
    registrationNumber: 'HRB123456',
    email: 'billing@acme.com',
    phone: '+4930123456',
    addressLine1: '123 Main St',
    city: 'Berlin',
    postCode: '10115',
    countryCode: 'DE',
    currency: 'EUR',
    ...overrides,
  }
}

describe('payhawk transformSupplier', () => {
  it('maps id', () => {
    expect(transformSupplier(makeRaw()).id).toBe('supp-1')
  })

  it('maps name', () => {
    expect(transformSupplier(makeRaw()).name).toBe('ACME Corp')
  })

  it('maps registrationNumber to identification', () => {
    expect(transformSupplier(makeRaw()).identification).toBe('HRB123456')
  })

  it('maps vatNumber to taxNumber', () => {
    expect(transformSupplier(makeRaw()).taxNumber).toBe('DE123456789')
  })

  it('sets isSupplier=true and isCustomer=false', () => {
    const result = transformSupplier(makeRaw())
    expect(result.isSupplier).toBe(true)
    expect(result.isCustomer).toBe(false)
  })

  it('maps currency', () => {
    expect(transformSupplier(makeRaw()).currency).toBe('EUR')
  })

  it('maps email to emails array', () => {
    const result = transformSupplier(makeRaw())
    expect(result.emails?.[0]?.email).toBe('billing@acme.com')
  })

  it('maps phone to telephones array', () => {
    const result = transformSupplier(makeRaw())
    expect(result.telephones?.[0]?.telephone).toBe('+4930123456')
  })

  it('maps billing address city', () => {
    const result = transformSupplier(makeRaw())
    expect(result.billingAddress?.city).toBe('Berlin')
  })

  it('passes ContactSchema.parse', () => {
    expect(() => ContactSchema.parse(transformSupplier(makeRaw()))).not.toThrow()
  })
})
