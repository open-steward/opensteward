import { describe, it, expect } from 'vitest'
import { transformContact } from '../../../../../../../src/verticals/accounting/adapters/ledgers-cloud/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

const base = {
  id: 'cont-1',
  display_name: 'Acme Corp',
  business_name: 'Acme Corporation',
  email: 'hello@acme.com',
  mobile: '+14155550100',
  phone: '+14155550101',
  currency: 'USD',
  is_active: true,
  contact_type: 'customer',
  billing_address: [
    {
      address: '123 Market St',
      city: 'San Francisco',
      state: 'CA',
      pin_code: '94105',
      country: 'US',
    },
  ],
  created_at: '2023-05-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
}

describe('transformContact', () => {
  it('maps core fields', () => {
    const result = transformContact(base)
    expect(result.id).toBe('cont-1')
    expect(result.name).toBe('Acme Corp')
    expect(result.companyName).toBe('Acme Corporation')
    expect(result.currency).toBe('USD')
    expect(result.isActive).toBe(true)
  })

  it('marks customer when contact_type is customer', () => {
    const result = transformContact(base)
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('marks supplier when contact_type is vendor', () => {
    const result = transformContact({ ...base, contact_type: 'vendor' })
    expect(result.isSupplier).toBe(true)
    expect(result.isCustomer).toBe(false)
  })

  it('marks both when contact_type is both', () => {
    const result = transformContact({ ...base, contact_type: 'both' })
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(true)
  })

  it('maps email to emails array', () => {
    const result = transformContact(base)
    expect(result.emails).toBeDefined()
    expect(result.emails![0].email).toBe('hello@acme.com')
  })

  it('maps billing_address[0] to billingAddress', () => {
    const result = transformContact(base)
    expect(result.billingAddress?.address1).toBe('123 Market St')
    expect(result.billingAddress?.city).toBe('San Francisco')
    expect(result.billingAddress?.region).toBe('CA')
    expect(result.billingAddress?.postalCode).toBe('94105')
    expect(result.billingAddress?.country).toBe('US')
  })

  it('maps gstin as taxNumber', () => {
    const result = transformContact({ ...base, gstin: 'GSTIN-001' })
    expect(result.taxNumber).toBe('GSTIN-001')
  })

  it('parses dates as Date objects', () => {
    const result = transformContact(base)
    expect(result.createdAt).toEqual(new Date('2023-05-01T00:00:00.000Z'))
    expect(result.updatedAt).toEqual(new Date('2024-01-01T00:00:00.000Z'))
  })

  it('passes schema validation', () => {
    expect(() => ContactSchema.parse(transformContact(base))).not.toThrow()
  })
})
