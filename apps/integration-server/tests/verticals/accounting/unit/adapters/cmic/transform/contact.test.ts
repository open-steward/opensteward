import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type CmicContact } from '../../../../../../../src/verticals/accounting/adapters/cmic/transform/contact'

function makeContact(overrides: Partial<CmicContact> = {}): CmicContact {
  return {
    VendorId: 'VND-001',
    Name: 'BuildRight Subcontractors Inc.',
    TaxId: 'US987654321',
    Email: 'billing@buildright.com',
    Phone: '+1-312-555-0100',
    Address: '456 Construction Ave',
    City: 'Chicago',
    State: 'IL',
    PostalCode: '60602',
    Country: 'US',
    IsActive: true,
    ...overrides,
  }
}

describe('transformContact (CMiC)', () => {
  it('maps id from VendorId', () => {
    expect(transformContact(makeContact()).id).toBe('VND-001')
  })

  it('maps name', () => {
    expect(transformContact(makeContact()).name).toBe('BuildRight Subcontractors Inc.')
  })

  it('maps taxNumber from TaxId', () => {
    expect(transformContact(makeContact()).taxNumber).toBe('US987654321')
  })

  it('is always isSupplier', () => {
    const result = transformContact(makeContact())
    expect(result.isSupplier).toBe(true)
    expect(result.isCustomer).toBe(false)
  })

  it('maps email', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('billing@buildright.com')
  })

  it('maps phone', () => {
    const result = transformContact(makeContact())
    expect(result.telephones).toHaveLength(1)
    expect(result.telephones![0].telephone).toBe('+1-312-555-0100')
  })

  it('maps billing address', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.address1).toBe('456 Construction Ave')
    expect(result.billingAddress?.city).toBe('Chicago')
    expect(result.billingAddress?.region).toBe('IL')
    expect(result.billingAddress?.postalCode).toBe('60602')
    expect(result.billingAddress?.country).toBe('US')
  })

  it('maps isActive', () => {
    expect(transformContact(makeContact({ IsActive: false })).isActive).toBe(false)
  })

  it('passes raw object as metadata', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
