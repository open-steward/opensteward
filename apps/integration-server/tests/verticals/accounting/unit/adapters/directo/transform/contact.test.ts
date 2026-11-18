import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  transformSupplier,
  type DirectoCustomer,
  type DirectoSupplier,
} from '../../../../../../../src/verticals/accounting/adapters/directo/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeCustomer(overrides: Partial<DirectoCustomer> = {}): DirectoCustomer {
  return {
    code: 'CUST01',
    name: 'Acme Corp',
    email: 'billing@acme.com',
    phone: '+1-555-0001',
    address1: '123 Main St',
    address2: 'Suite 4',
    address3: 'Tallinn',
    country: 'EE',
    vatregno: 'EE123456789',
    currency: 'EUR',
    closed: false,
    ...overrides,
  }
}

function makeSupplier(overrides: Partial<DirectoSupplier> = {}): DirectoSupplier {
  return {
    code: 'SUPP01',
    name: 'Baltic Supplies OÜ',
    email: 'accounts@baltic.ee',
    phone: '+372-555-0002',
    address1: 'Pärnu mnt 1',
    address3: 'Tallinn',
    country: 'EE',
    vatregno: 'EE987654321',
    currency: 'EUR',
    closed: false,
    ...overrides,
  }
}

describe('directo transformCustomer', () => {
  it('prefixes code with cust_', () => {
    const result = transformCustomer(makeCustomer({ code: 'C42' }))
    expect(result.id).toBe('cust_C42')
  })

  it('isCustomer=true, isSupplier=false', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('closed=false → isActive=true', () => {
    const result = transformCustomer(makeCustomer({ closed: false }))
    expect(result.isActive).toBe(true)
  })

  it('closed=true → isActive=false', () => {
    const result = transformCustomer(makeCustomer({ closed: true }))
    expect(result.isActive).toBe(false)
  })

  it('maps vatregno to taxNumber', () => {
    const result = transformCustomer(makeCustomer({ vatregno: 'EE123456789' }))
    expect(result.taxNumber).toBe('EE123456789')
  })

  it('maps address3 to billing city', () => {
    const result = transformCustomer(makeCustomer({ address3: 'Tartu' }))
    expect(result.billingAddress?.city).toBe('Tartu')
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

describe('directo transformSupplier', () => {
  it('prefixes code with supp_', () => {
    const result = transformSupplier(makeSupplier({ code: 'S99' }))
    expect(result.id).toBe('supp_S99')
  })

  it('isCustomer=false, isSupplier=true', () => {
    const result = transformSupplier(makeSupplier())
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('maps vatregno to taxNumber', () => {
    const result = transformSupplier(makeSupplier({ vatregno: 'EE987654321' }))
    expect(result.taxNumber).toBe('EE987654321')
  })

  it('passes ContactSchema.parse without throwing', () => {
    const result = transformSupplier(makeSupplier())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
