import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformDebtor,
  transformSupplier,
  type FADebtor,
  type FASupplier,
} from '../../../../../../../src/verticals/accounting/adapters/frontaccounting/transform/contact'

describe('transformDebtor (FrontAccounting)', () => {
  const rawDebtor: FADebtor = {
    id: 10,
    name: 'ACME Inc.',
    email: 'info@acme.com',
    phone: '+1-555-1234',
    address: '123 Main St',
    postal_code: '10001',
    city: 'New York',
    country_code: 'US',
    gst_no: 'US123456789',
    curr_code: 'USD',
    inactive: 0,
  }

  it('maps core fields correctly', () => {
    const result = transformDebtor(rawDebtor)
    expect(result.id).toBe('customer_10')
    expect(result.name).toBe('ACME Inc.')
    expect(result.taxNumber).toBe('US123456789')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
    expect(result.isActive).toBe(true)
    expect(result.currency).toBe('USD')
  })

  it('maps address', () => {
    const result = transformDebtor(rawDebtor)
    expect(result.billingAddress?.address1).toBe('123 Main St')
    expect(result.billingAddress?.city).toBe('New York')
  })

  it('marks inactive debtor', () => {
    const result = transformDebtor({ ...rawDebtor, inactive: 1 })
    expect(result.isActive).toBe(false)
  })

  it('sets metadata to raw object', () => {
    expect(transformDebtor(rawDebtor).metadata).toBe(rawDebtor)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDebtor(rawDebtor)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('transformSupplier (FrontAccounting)', () => {
  const rawSupplier: FASupplier = {
    id: 20,
    supp_name: 'Global Supply Co.',
    email: 'orders@globalsupply.com',
    curr_code: 'GBP',
    inactive: 0,
  }

  it('maps core fields correctly', () => {
    const result = transformSupplier(rawSupplier)
    expect(result.id).toBe('supplier_20')
    expect(result.name).toBe('Global Supply Co.')
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
    expect(result.currency).toBe('GBP')
  })

  it('sets metadata to raw object', () => {
    expect(transformSupplier(rawSupplier).metadata).toBe(rawSupplier)
  })
})
