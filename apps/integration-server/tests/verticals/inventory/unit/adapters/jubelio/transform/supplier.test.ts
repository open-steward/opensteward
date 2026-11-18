import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawJubelioSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/jubelio/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('transformSupplier — jubelio', () => {
  const raw: RawJubelioSupplier = {
    contact_id: 30,
    contact_name: 'Supplier IDR',
    email: 'orders@supplier.example.com',
    phone: '+62211234567',
    currency: 'IDR',
    is_active: true,
    status: 'active',
    credit_term: 30,
  }
  const result = transformSupplier(raw)

  it('sets id from contact_id', () => {
    expect(result.id).toBe('30')
  })

  it('sets name from contact_name', () => {
    expect(result.name).toBe('Supplier IDR')
  })

  it('sets email from email', () => {
    expect(result.email).toBe('orders@supplier.example.com')
  })

  it('sets phone from phone', () => {
    expect(result.phone).toBe('+62211234567')
  })

  it('sets defaultCurrency from currency', () => {
    expect(result.defaultCurrency).toBe('IDR')
  })

  it('sets defaultLeadTimeDays from credit_term', () => {
    expect(result.defaultLeadTimeDays).toBe(30)
  })

  it('sets isActive to true when status is active', () => {
    expect(result.isActive).toBe(true)
  })

  it('sets platform to jubelio', () => {
    expect(result.platform).toBe('jubelio')
  })

  it('passes schema validation', () => {
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})

describe('transformSupplier — inactive jubelio supplier', () => {
  const raw: RawJubelioSupplier = {
    contact_id: '99',
    contact_name: 'Old Vendor',
    status: 'inactive',
  }
  const result = transformSupplier(raw)

  it('sets isActive to false when status is inactive', () => {
    expect(result.isActive).toBe(false)
  })

  it('passes schema validation', () => {
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
