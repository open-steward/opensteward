import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  transformSupplier,
  type MriCustomer,
  type MriSupplier,
} from '../../../../../../../src/verticals/accounting/adapters/mri-software/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeCustomer(overrides: Partial<MriCustomer> = {}): MriCustomer {
  return {
    id: 'cust-001',
    name: 'Tenant Corp',
    firstName: 'Jane',
    lastName: 'Doe',
    companyName: 'Tenant Corp Ltd',
    email: 'jane@tenant.com',
    phone: '+1-555-1234',
    currencyCode: 'USD',
    isActive: true,
    taxNumber: 'US123456789',
    billingAddress: {
      line1: '100 Main St',
      city: 'New York',
      state: 'NY',
      postalCode: '10001',
      country: 'US',
    },
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-06-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeSupplier(overrides: Partial<MriSupplier> = {}): MriSupplier {
  return {
    id: 'sup-001',
    name: 'Vendor Co',
    email: 'vendor@example.com',
    phone: '+44-20-1234-5678',
    currencyCode: 'GBP',
    isActive: true,
    address: {
      line1: '5 Vendor Rd',
      city: 'London',
      postalCode: 'SW1A 1AA',
      country: 'GB',
    },
    createdAt: '2024-02-01T00:00:00.000Z',
    updatedAt: '2024-06-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformCustomer (mri-software)', () => {
  it('prefixes id with cust_', () => {
    expect(transformCustomer(makeCustomer()).id).toBe('cust_cust-001')
  })

  it('maps isCustomer=true and isSupplier=false', () => {
    const c = transformCustomer(makeCustomer())
    expect(c.isCustomer).toBe(true)
    expect(c.isSupplier).toBe(false)
  })

  it('maps email to WORK email', () => {
    expect(transformCustomer(makeCustomer()).emails![0].email).toBe('jane@tenant.com')
  })

  it('maps taxNumber', () => {
    expect(transformCustomer(makeCustomer()).taxNumber).toBe('US123456789')
  })

  it('maps billingAddress city', () => {
    expect(transformCustomer(makeCustomer()).billingAddress?.city).toBe('New York')
  })

  it('maps createdAt to Date', () => {
    expect(transformCustomer(makeCustomer()).createdAt).toEqual(
      new Date('2024-01-01T00:00:00.000Z'),
    )
  })

  it('passes ContactSchema.parse without throwing', () => {
    expect(() => ContactSchema.parse(transformCustomer(makeCustomer()))).not.toThrow()
  })
})

describe('transformSupplier (mri-software)', () => {
  it('prefixes id with vend_', () => {
    expect(transformSupplier(makeSupplier()).id).toBe('vend_sup-001')
  })

  it('maps isSupplier=true and isCustomer=false', () => {
    const c = transformSupplier(makeSupplier())
    expect(c.isSupplier).toBe(true)
    expect(c.isCustomer).toBe(false)
  })

  it('maps currency', () => {
    expect(transformSupplier(makeSupplier()).currency).toBe('GBP')
  })

  it('maps billing address from address field', () => {
    expect(transformSupplier(makeSupplier()).billingAddress?.city).toBe('London')
  })

  it('passes ContactSchema.parse without throwing', () => {
    expect(() => ContactSchema.parse(transformSupplier(makeSupplier()))).not.toThrow()
  })
})
