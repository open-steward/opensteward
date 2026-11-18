import { describe, it, expect } from 'vitest'
import {
  transformVendor,
  type AvidXchangeVendor,
} from '../../../../../../../src/verticals/accounting/adapters/avidxchange/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeRaw(overrides: Partial<AvidXchangeVendor> = {}): AvidXchangeVendor {
  return {
    vendorId: 'VND-001',
    vendorCode: 'ACME',
    vendorName: 'Acme Supplies',
    taxId: 'US-123456789',
    isActive: true,
    email: 'vendor@acme.com',
    phone: '+15551234567',
    fax: '+15559876543',
    address1: '123 Main St',
    address2: 'Suite 200',
    city: 'Chicago',
    state: 'IL',
    postalCode: '60601',
    country: 'US',
    currency: 'USD',
    paymentMethod: 'ACH',
    createdDate: '2024-01-01T00:00:00.000Z',
    modifiedDate: '2024-06-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformVendor (avidxchange)', () => {
  it('maps core fields correctly', () => {
    const result = transformVendor(makeRaw())
    expect(result.id).toBe('VND-001')
    expect(result.name).toBe('Acme Supplies')
    expect(result.identification).toBe('ACME')
    expect(result.taxNumber).toBe('US-123456789')
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
    expect(result.currency).toBe('USD')
  })

  it('maps phone and fax telephones', () => {
    const result = transformVendor(makeRaw())
    expect(result.telephones).toBeDefined()
    const phone = result.telephones!.find((t) => t.type === 'WORK')
    expect(phone?.telephone).toBe('+15551234567')
    const fax = result.telephones!.find((t) => t.type === 'FAX')
    expect(fax?.telephone).toBe('+15559876543')
  })

  it('maps billing address fields', () => {
    const result = transformVendor(makeRaw())
    expect(result.billingAddress?.address1).toBe('123 Main St')
    expect(result.billingAddress?.city).toBe('Chicago')
    expect(result.billingAddress?.country).toBe('US')
  })

  it('maps remittanceAddress to shippingAddress', () => {
    const result = transformVendor(
      makeRaw({
        remittanceAddress: {
          address1: '456 Remittance Ave',
          city: 'Springfield',
          state: 'IL',
          postalCode: '62701',
          country: 'US',
        },
      }),
    )
    expect(result.shippingAddress?.address1).toBe('456 Remittance Ave')
    expect(result.shippingAddress?.city).toBe('Springfield')
  })

  it('parses dates as Date objects', () => {
    const result = transformVendor(makeRaw())
    expect(result.createdAt).toEqual(new Date('2024-01-01T00:00:00.000Z'))
    expect(result.updatedAt).toEqual(new Date('2024-06-01T00:00:00.000Z'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformVendor(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes ContactSchema.parse without throwing', () => {
    const result = transformVendor(makeRaw())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
