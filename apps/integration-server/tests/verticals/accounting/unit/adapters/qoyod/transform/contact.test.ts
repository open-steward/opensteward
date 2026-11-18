import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  transformVendor,
  type QoyodCustomer,
  type QoyodVendor,
} from '../../../../../../../src/verticals/accounting/adapters/qoyod/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeCustomer(overrides: Partial<QoyodCustomer> = {}): QoyodCustomer {
  return {
    id: 300,
    name: 'Customer Corp',
    email: 'sales@customer.com',
    phone: '+966501234567',
    vat_number: 'SA123456789',
    address: '10 King St',
    city: 'Riyadh',
    country: 'SA',
    zip_code: '12345',
    currency: 'SAR',
    is_active: true,
    ...overrides,
  }
}

function makeVendor(overrides: Partial<QoyodVendor> = {}): QoyodVendor {
  return {
    id: 400,
    name: 'Supplier Ltd',
    email: 'accounts@supplier.com',
    phone: '+966507654321',
    vat_number: 'SA987654321',
    currency: 'SAR',
    is_active: true,
    ...overrides,
  }
}

describe('qoyod transformCustomer', () => {
  it('prefixes id with cust_', () => {
    expect(transformCustomer(makeCustomer()).id).toBe('cust_300')
  })

  it('maps name', () => {
    expect(transformCustomer(makeCustomer()).name).toBe('Customer Corp')
  })

  it('maps vat_number to taxNumber', () => {
    expect(transformCustomer(makeCustomer()).taxNumber).toBe('SA123456789')
  })

  it('sets isCustomer=true and isSupplier=false', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps is_active to isActive', () => {
    expect(transformCustomer(makeCustomer({ is_active: false })).isActive).toBe(false)
  })

  it('defaults isActive to true when is_active absent', () => {
    expect(transformCustomer(makeCustomer({ is_active: null })).isActive).toBe(true)
  })

  it('maps currency', () => {
    expect(transformCustomer(makeCustomer()).currency).toBe('SAR')
  })

  it('maps email to emails array', () => {
    expect(transformCustomer(makeCustomer()).emails?.[0]?.email).toBe('sales@customer.com')
  })

  it('maps phone to telephones array', () => {
    expect(transformCustomer(makeCustomer()).telephones?.[0]?.telephone).toBe('+966501234567')
  })

  it('maps address to billingAddress.address1', () => {
    expect(transformCustomer(makeCustomer()).billingAddress?.address1).toBe('10 King St')
  })

  it('maps city to billingAddress.city', () => {
    expect(transformCustomer(makeCustomer()).billingAddress?.city).toBe('Riyadh')
  })

  it('passes ContactSchema.parse', () => {
    expect(() => ContactSchema.parse(transformCustomer(makeCustomer()))).not.toThrow()
  })
})

describe('qoyod transformVendor', () => {
  it('prefixes id with vend_', () => {
    expect(transformVendor(makeVendor()).id).toBe('vend_400')
  })

  it('maps name', () => {
    expect(transformVendor(makeVendor()).name).toBe('Supplier Ltd')
  })

  it('sets isCustomer=false and isSupplier=true', () => {
    const result = transformVendor(makeVendor())
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('passes ContactSchema.parse', () => {
    expect(() => ContactSchema.parse(transformVendor(makeVendor()))).not.toThrow()
  })
})
