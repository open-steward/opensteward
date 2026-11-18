import { describe, it, expect } from 'vitest'
import {
  transformVendor,
  type CampfireVendor,
} from '../../../../../../../src/verticals/accounting/adapters/campfire/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeVendor(overrides: Partial<CampfireVendor> = {}): CampfireVendor {
  return {
    id: 55,
    name: 'Acme Corp',
    first_name: 'Jane',
    last_name: 'Doe',
    company_name: 'Acme Corp',
    email: 'jane@acme.example',
    phone_number: '+15551234567',
    vendor_type: 'customer',
    status: 'ACTIVE',
    ...overrides,
  }
}

describe('transformVendor', () => {
  it('maps id to string', () => {
    expect(transformVendor(makeVendor()).id).toBe('55')
  })

  it('maps first_name and last_name', () => {
    const result = transformVendor(makeVendor())
    expect(result.firstName).toBe('Jane')
    expect(result.lastName).toBe('Doe')
  })

  it('maps company_name to companyName', () => {
    expect(transformVendor(makeVendor()).companyName).toBe('Acme Corp')
  })

  it('maps email to emails array with WORK type', () => {
    const result = transformVendor(makeVendor())
    expect(result.emails).toBeDefined()
    expect(result.emails![0].email).toBe('jane@acme.example')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps phone_number to telephones with WORK type', () => {
    const result = transformVendor(makeVendor())
    const phones = result.telephones!
    expect(phones.some((t) => t.telephone === '+15551234567' && t.type === 'WORK')).toBe(true)
  })

  it('maps mobile_number to telephones with MOBILE type', () => {
    const result = transformVendor(makeVendor({ mobile_number: '+15559876543' }))
    const phones = result.telephones!
    expect(phones.some((t) => t.telephone === '+15559876543' && t.type === 'MOBILE')).toBe(true)
  })

  it('sets isCustomer=true when vendor_type is customer', () => {
    expect(transformVendor(makeVendor({ vendor_type: 'customer' })).isCustomer).toBe(true)
    expect(transformVendor(makeVendor({ vendor_type: 'customer' })).isSupplier).toBe(false)
  })

  it('sets isSupplier=true when vendor_type is vendor', () => {
    expect(transformVendor(makeVendor({ vendor_type: 'vendor' })).isSupplier).toBe(true)
    expect(transformVendor(makeVendor({ vendor_type: 'vendor' })).isCustomer).toBe(false)
  })

  it('sets isSupplier=true when vendor_type is employee', () => {
    expect(transformVendor(makeVendor({ vendor_type: 'employee' })).isSupplier).toBe(true)
  })

  it('maps ACTIVE status to isActive=true', () => {
    expect(transformVendor(makeVendor({ status: 'ACTIVE' })).isActive).toBe(true)
  })

  it('maps non-ACTIVE status to isActive=false', () => {
    expect(transformVendor(makeVendor({ status: 'INACTIVE' })).isActive).toBe(false)
    expect(transformVendor(makeVendor({ status: null })).isActive).toBe(false)
  })

  it('maps vat_number to taxNumber', () => {
    expect(transformVendor(makeVendor({ vat_number: 'VAT123' })).taxNumber).toBe('VAT123')
  })

  it('maps business_id_ssn to identification', () => {
    expect(transformVendor(makeVendor({ business_id_ssn: 'SSN-999' })).identification).toBe(
      'SSN-999',
    )
  })

  it('maps billing address fields', () => {
    const result = transformVendor(
      makeVendor({
        billing_address_street_1: '123 Main St',
        billing_city: 'Springfield',
        billing_country: 'US',
      }),
    )
    expect(result.billingAddress?.address1).toBe('123 Main St')
    expect(result.billingAddress?.city).toBe('Springfield')
    expect(result.billingAddress?.country).toBe('US')
  })

  it('maps shipping address fields', () => {
    const result = transformVendor(
      makeVendor({
        address_street_1: '456 Oak Ave',
        city: 'Shelbyville',
        country: 'US',
      }),
    )
    expect(result.shippingAddress?.address1).toBe('456 Oak Ave')
    expect(result.shippingAddress?.city).toBe('Shelbyville')
  })

  it('maps created_at to createdAt Date', () => {
    const result = transformVendor(makeVendor({ created_at: '2024-01-01T00:00:00Z' }))
    expect(result.createdAt).toEqual(new Date('2024-01-01T00:00:00Z'))
  })

  it('maps last_modified_at to updatedAt Date', () => {
    const result = transformVendor(makeVendor({ last_modified_at: '2024-06-01T00:00:00Z' }))
    expect(result.updatedAt).toEqual(new Date('2024-06-01T00:00:00Z'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeVendor()
    expect(transformVendor(raw).metadata).toBe(raw)
  })

  it('output passes schema validation', () => {
    expect(() => ContactSchema.parse(transformVendor(makeVendor()))).not.toThrow()
  })
})
