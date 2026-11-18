import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type DeskeraContact,
} from '../../../../../../../src/verticals/accounting/adapters/deskera/transform/contact'

function makeRaw(overrides: Partial<DeskeraContact> = {}): DeskeraContact {
  return {
    id: 'CUST-001',
    name: 'Acme Pte Ltd',
    email: 'info@acme.com',
    phone: '+6512345678',
    isCustomer: true,
    isVendor: false,
    currencyCode: 'SGD',
    taxNumber: 'GST-123456',
    billingAddress: {
      address1: '1 Tech Park',
      address2: 'Level 5',
      city: 'Singapore',
      state: 'SG',
      country: 'SG',
      postalCode: '123456',
    },
    shippingAddress: undefined,
    status: 'ACTIVE',
    ...overrides,
  }
}

describe('transformContact (Deskera)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeRaw())
    expect(result.id).toBe('CUST-001')
    expect(result.name).toBe('Acme Pte Ltd')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
    expect(result.isActive).toBe(true)
    expect(result.currency).toBe('SGD')
    expect(result.taxNumber).toBe('GST-123456')
  })

  it('maps isVendor to isSupplier', () => {
    const result = transformContact(makeRaw({ isVendor: true, isCustomer: false }))
    expect(result.isSupplier).toBe(true)
    expect(result.isCustomer).toBe(false)
  })

  it('maps both isCustomer and isVendor true', () => {
    const result = transformContact(makeRaw({ isCustomer: true, isVendor: true }))
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(true)
  })

  it('maps email to work email', () => {
    const result = transformContact(makeRaw())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('info@acme.com')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps phone to telephone', () => {
    const result = transformContact(makeRaw())
    expect(result.telephones).toHaveLength(1)
    expect(result.telephones![0].telephone).toBe('+6512345678')
  })

  it('maps billing address', () => {
    const result = transformContact(makeRaw())
    expect(result.billingAddress?.address1).toBe('1 Tech Park')
    expect(result.billingAddress?.city).toBe('Singapore')
    expect(result.billingAddress?.postalCode).toBe('123456')
    expect(result.billingAddress?.country).toBe('SG')
  })

  it('maps INACTIVE status to isActive false', () => {
    const result = transformContact(makeRaw({ status: 'INACTIVE' }))
    expect(result.isActive).toBe(false)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
  })

  it('returns undefined emails when no email provided', () => {
    const result = transformContact(makeRaw({ email: undefined }))
    expect(result.emails).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
