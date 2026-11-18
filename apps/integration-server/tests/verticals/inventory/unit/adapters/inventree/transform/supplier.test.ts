import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawInvenTreeCompany,
} from '../../../../../../../src/verticals/inventory/adapters/inventree/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('transformSupplier — inventree company', () => {
  const raw: RawInvenTreeCompany = {
    pk: 10,
    name: 'Acme Corp',
    description: 'A great supplier',
    website: 'https://acme.example.com',
    phone: '+14155550199',
    email: 'orders@acme.example.com',
    currency: 'USD',
    active: true,
    is_supplier: true,
    is_manufacturer: false,
    is_customer: false,
    parts_supplied: 42,
    address: '123 Main St',
    primary_address: null,
  }
  const result = transformSupplier(raw)

  it('sets id from pk', () => {
    expect(result.id).toBe('10')
  })

  it('sets name from name', () => {
    expect(result.name).toBe('Acme Corp')
  })

  it('sets email from email', () => {
    expect(result.email).toBe('orders@acme.example.com')
  })

  it('sets phone from phone', () => {
    expect(result.phone).toBe('+14155550199')
  })

  it('sets defaultCurrency from currency', () => {
    expect(result.defaultCurrency).toBe('USD')
  })

  it('sets isActive from active', () => {
    expect(result.isActive).toBe(true)
  })

  it('defaultLeadTimeDays is undefined', () => {
    expect(result.defaultLeadTimeDays).toBeUndefined()
  })

  it('sets platform to inventree', () => {
    expect(result.platform).toBe('inventree')
  })

  it('passes schema validation', () => {
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})

describe('transformSupplier — inactive company', () => {
  const raw: RawInvenTreeCompany = {
    pk: 20,
    name: 'Old Supplier',
    active: false,
  }
  const result = transformSupplier(raw)

  it('sets isActive to false when active is false', () => {
    expect(result.isActive).toBe(false)
  })

  it('passes schema validation', () => {
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
