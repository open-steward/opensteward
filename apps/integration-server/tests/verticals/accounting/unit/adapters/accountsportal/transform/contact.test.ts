import { describe, it, expect } from 'vitest'
import {
  transformContact,
  type APContact,
} from '../../../../../../../src/verticals/accounting/adapters/accountsportal/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeAPContact(overrides: Partial<APContact> = {}): APContact {
  return {
    id: 123,
    name: 'Jane Doe',
    company_name: 'Acme Ltd',
    email: 'jane@acme.example',
    phone: '+441234567890',
    mobile: '+447911234567',
    vat_number: 'GB123456789',
    address_line_1: '1 Main Street',
    address_line_2: 'Suite 10',
    city: 'London',
    region: 'Greater London',
    postcode: 'EC1A 1BB',
    country: 'GB',
    contact_type: 'customer',
    is_active: true,
    created_at: '2024-01-10T08:00:00.000Z',
    updated_at: '2024-06-01T12:00:00.000Z',
    ...overrides,
  }
}

describe('transformContact (accountsportal)', () => {
  it('id is c_<id> for customer', () => {
    expect(transformContact(makeAPContact({ contact_type: 'customer', id: 123 })).id).toBe('c_123')
  })

  it('id is s_<id> for supplier', () => {
    expect(transformContact(makeAPContact({ contact_type: 'supplier', id: 456 })).id).toBe('s_456')
  })

  it('maps name', () => {
    expect(transformContact(makeAPContact()).name).toBe('Jane Doe')
  })

  it('maps companyName', () => {
    expect(transformContact(makeAPContact()).companyName).toBe('Acme Ltd')
  })

  it('maps vat_number to taxNumber', () => {
    expect(transformContact(makeAPContact()).taxNumber).toBe('GB123456789')
  })

  it('isCustomer=true and isSupplier=false for customer', () => {
    const result = transformContact(makeAPContact({ contact_type: 'customer' }))
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('isCustomer=false and isSupplier=true for supplier', () => {
    const result = transformContact(makeAPContact({ contact_type: 'supplier' }))
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('maps is_active', () => {
    expect(transformContact(makeAPContact({ is_active: false })).isActive).toBe(false)
  })

  it('maps email as WORK email', () => {
    const result = transformContact(makeAPContact())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('jane@acme.example')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps phone as WORK and mobile as MOBILE', () => {
    const result = transformContact(makeAPContact())
    const types = result.telephones!.map((t) => t.type)
    expect(types).toContain('WORK')
    expect(types).toContain('MOBILE')
  })

  it('omits emails when email is null', () => {
    const result = transformContact(makeAPContact({ email: null }))
    expect(result.emails).toBeUndefined()
  })

  it('maps billingAddress', () => {
    const result = transformContact(makeAPContact())
    expect(result.billingAddress?.address1).toBe('1 Main Street')
    expect(result.billingAddress?.address2).toBe('Suite 10')
    expect(result.billingAddress?.city).toBe('London')
    expect(result.billingAddress?.country).toBe('GB')
  })

  it('maps createdAt and updatedAt as Date', () => {
    const result = transformContact(makeAPContact())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes ContactSchema.parse without throwing', () => {
    expect(() => ContactSchema.parse(transformContact(makeAPContact()))).not.toThrow()
  })
})
