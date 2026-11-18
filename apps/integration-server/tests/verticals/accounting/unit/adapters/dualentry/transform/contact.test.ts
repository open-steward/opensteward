import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  transformVendor,
  type DualentryCustomer,
  type DualentryVendor,
} from '../../../../../../../src/verticals/accounting/adapters/dualentry/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeCustomer(overrides: Partial<DualentryCustomer> = {}): DualentryCustomer {
  return {
    id: 10,
    name: 'Acme Corp',
    unique_id: 'CUST-001',
    email: 'billing@acme.com',
    website: 'https://acme.com',
    phone: '+1-555-0001',
    customer_type: 'company',
    is_active: true,
    full_address: {
      street: '123 Main St',
      second_line: 'Suite 4',
      city: 'New York',
      state: 'NY',
      postal_code: '10001',
      country: 'US',
    },
    shipping_address: null,
    ...overrides,
  }
}

function makeVendor(overrides: Partial<DualentryVendor> = {}): DualentryVendor {
  return {
    id: 20,
    name: 'Baltic Supplies OÜ',
    vendor_type: 'company',
    unique_id: 'VEND-001',
    email: 'accounts@baltic.ee',
    website: null,
    phone: '+372-555-0002',
    country: 'EE',
    is_active: true,
    tin: 'EE987654321',
    tin_type: 'vat',
    address: {
      street: 'Pärnu mnt 1',
      second_line: null,
      city: 'Tallinn',
      state: null,
      postal_code: '10148',
      country: 'EE',
    },
    ...overrides,
  }
}

describe('dualentry transformCustomer', () => {
  it('prefixes id with cust_', () => {
    const result = transformCustomer(makeCustomer({ id: 42 }))
    expect(result.id).toBe('cust_42')
  })

  it('isCustomer=true, isSupplier=false', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('is_active reflects isActive', () => {
    const result = transformCustomer(makeCustomer({ is_active: false }))
    expect(result.isActive).toBe(false)
  })

  it('maps billing address street', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.billingAddress?.address1).toBe('123 Main St')
  })

  it('maps unique_id to identification', () => {
    const result = transformCustomer(makeCustomer({ unique_id: 'ABC-123' }))
    expect(result.identification).toBe('ABC-123')
  })

  it('metadata is the raw object', () => {
    const raw = makeCustomer()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes ContactSchema.parse without throwing', () => {
    const result = transformCustomer(makeCustomer())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('dualentry transformVendor', () => {
  it('prefixes id with vend_', () => {
    const result = transformVendor(makeVendor({ id: 55 }))
    expect(result.id).toBe('vend_55')
  })

  it('isCustomer=false, isSupplier=true', () => {
    const result = transformVendor(makeVendor())
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('maps tin to taxNumber', () => {
    const result = transformVendor(makeVendor({ tin: 'EE123' }))
    expect(result.taxNumber).toBe('EE123')
  })

  it('passes ContactSchema.parse without throwing', () => {
    const result = transformVendor(makeVendor())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
