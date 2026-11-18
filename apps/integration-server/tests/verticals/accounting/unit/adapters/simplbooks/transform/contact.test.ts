import { describe, it, expect } from 'vitest'
import {
  transformContact,
  type SimplbooksContact,
} from '../../../../../../../src/verticals/accounting/adapters/simplbooks/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeRaw(overrides: Partial<SimplbooksContact> = {}): SimplbooksContact {
  return {
    id: 10,
    name: 'Acme OÜ',
    reg_code: '12345678',
    vat_number: 'EE123456789',
    email: 'info@acme.example',
    phone: '+3725551234',
    type: 'both',
    is_active: true,
    currency: 'EUR',
    address: 'Liivalaia 12',
    city: 'Tallinn',
    postal_code: '10118',
    country: 'EE',
    ...overrides,
  }
}

describe('transformContact (simplbooks)', () => {
  it('maps numeric id to string id', () => {
    expect(transformContact(makeRaw()).id).toBe('10')
  })

  it('maps name', () => {
    expect(transformContact(makeRaw()).name).toBe('Acme OÜ')
  })

  it('maps vat_number to taxNumber', () => {
    expect(transformContact(makeRaw()).taxNumber).toBe('EE123456789')
  })

  it('maps reg_code to identification', () => {
    expect(transformContact(makeRaw()).identification).toBe('12345678')
  })

  it('maps type=client to isCustomer=true, isSupplier=false', () => {
    const result = transformContact(makeRaw({ type: 'client' }))
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps type=supplier to isSupplier=true, isCustomer=false', () => {
    const result = transformContact(makeRaw({ type: 'supplier' }))
    expect(result.isSupplier).toBe(true)
    expect(result.isCustomer).toBe(false)
  })

  it('maps type=both to isCustomer=true and isSupplier=true', () => {
    const result = transformContact(makeRaw({ type: 'both' }))
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(true)
  })

  it('maps email to work email', () => {
    const result = transformContact(makeRaw())
    expect(result.emails?.[0]?.email).toBe('info@acme.example')
    expect(result.emails?.[0]?.type).toBe('WORK')
  })

  it('maps billing address fields', () => {
    const result = transformContact(makeRaw())
    expect(result.billingAddress?.address1).toBe('Liivalaia 12')
    expect(result.billingAddress?.city).toBe('Tallinn')
    expect(result.billingAddress?.postalCode).toBe('10118')
    expect(result.billingAddress?.country).toBe('EE')
  })

  it('maps is_active', () => {
    expect(transformContact(makeRaw({ is_active: false })).isActive).toBe(false)
  })

  it('passes ContactSchema.parse without throwing', () => {
    expect(() => ContactSchema.parse(transformContact(makeRaw()))).not.toThrow()
  })
})
