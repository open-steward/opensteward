import { describe, it, expect } from 'vitest'
import { transformSupplier } from '../../../../../../../src/verticals/inventory/adapters/prediko/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('transformSupplier — prediko supplier', () => {
  const raw = {
    id: 'sup_abc',
    name: 'Keyboards Inc',
    emails: ['orders@keyboards.example', 'support@keyboards.example'],
    currency: 'USD',
    lead_time: 14,
    minimum_order_quantity: 100,
    minimum_order_type: 'units',
    address: {
      address1: '123 Main St',
      city: 'San Francisco',
      province: 'CA',
      country: 'US',
      zip: '94105',
    },
  }
  const result = transformSupplier(raw)

  it('sets id from raw.id', () => {
    expect(result.id).toBe('sup_abc')
  })

  it('sets externalId matching id', () => {
    expect(result.externalId).toBe('sup_abc')
  })

  it('sets name from raw.name', () => {
    expect(result.name).toBe('Keyboards Inc')
  })

  it('sets email from first entry in emails array', () => {
    expect(result.email).toBe('orders@keyboards.example')
  })

  it('sets defaultCurrency from currency', () => {
    expect(result.defaultCurrency).toBe('USD')
  })

  it('sets defaultLeadTimeDays from lead_time', () => {
    expect(result.defaultLeadTimeDays).toBe(14)
  })

  it('sets isActive to true (hardcoded)', () => {
    expect(result.isActive).toBe(true)
  })

  it('has no phone (not in Prediko supplier API)', () => {
    expect(result.phone).toBeUndefined()
  })

  it('stores minimumOrderQuantity in metadata', () => {
    expect(result.metadata['minimumOrderQuantity']).toBe('100')
  })

  it('stores minimumOrderType in metadata', () => {
    expect(result.metadata['minimumOrderType']).toBe('units')
  })

  it('sets platform to prediko', () => {
    expect(result.platform).toBe('prediko')
  })

  it('passes schema validation', () => {
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})

describe('transformSupplier — null emails array', () => {
  const result = transformSupplier({ id: 'sup_1', name: 'No Email Supplier', emails: null })

  it('leaves email undefined when emails is null', () => {
    expect(result.email).toBeUndefined()
  })

  it('passes schema validation', () => {
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})

describe('transformSupplier — empty emails array', () => {
  const result = transformSupplier({ id: 'sup_2', name: 'Empty Emails', emails: [] })

  it('leaves email undefined when emails array is empty', () => {
    expect(result.email).toBeUndefined()
  })

  it('passes schema validation', () => {
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
