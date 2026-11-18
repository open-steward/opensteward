import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type Unit4Contact } from '../../../../../../../src/verticals/accounting/adapters/unit4/transform/contact'

function makeContact(overrides: Partial<Unit4Contact> = {}): Unit4Contact {
  return {
    supplierId: 'supp_001',
    name: 'Acme Supplies Ltd',
    organizationNumber: 'ORG-123456',
    vatNumber: 'VAT-987654',
    email: 'accounts@acme.com',
    phone: '+1-555-0100',
    address: {
      street: '1 Commerce Rd',
      city: 'London',
      postalCode: 'EC1A 1BB',
      country: 'GB',
    },
    isSupplier: true,
    isCustomer: false,
    ...overrides,
  }
}

describe('transformContact (Unit4)', () => {
  it('prefixes supplier id with supp_', () => {
    expect(transformContact(makeContact({ supplierId: '001' })).id).toBe('supp_001')
  })

  it('prefixes debtor id with debt_', () => {
    const raw = makeContact({ debtorId: '42' })
    delete raw.supplierId
    expect(transformContact(raw).id).toBe('debt_42')
  })

  it('maps name', () => {
    expect(transformContact(makeContact({ name: 'Corp Name' })).name).toBe('Corp Name')
  })

  it('maps organizationNumber to identification', () => {
    expect(transformContact(makeContact({ organizationNumber: 'REG-99' })).identification).toBe('REG-99')
  })

  it('maps vatNumber to taxNumber', () => {
    expect(transformContact(makeContact({ vatNumber: 'VAT-001' })).taxNumber).toBe('VAT-001')
  })

  it('maps email', () => {
    const result = transformContact(makeContact({ email: 'test@corp.com' }))
    expect(result.emails![0].email).toBe('test@corp.com')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps phone to work telephone', () => {
    const result = transformContact(makeContact({ phone: '+44-800-000' }))
    expect(result.telephones![0].telephone).toBe('+44-800-000')
  })

  it('maps address fields', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.address1).toBe('1 Commerce Rd')
    expect(result.billingAddress?.city).toBe('London')
    expect(result.billingAddress?.country).toBe('GB')
  })

  it('sets isSupplier true for supplier contact', () => {
    expect(transformContact(makeContact({ isSupplier: true })).isSupplier).toBe(true)
  })

  it('sets isCustomer true for debtor contact', () => {
    const raw = makeContact({ isCustomer: true, isSupplier: false })
    expect(transformContact(raw).isCustomer).toBe(true)
  })

  it('passes raw object as metadata by reference', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact({ supplierId: '001' }))
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
