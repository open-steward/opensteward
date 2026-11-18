import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawFulfilParty,
} from '../../../../../../../src/verticals/inventory/adapters/fulfil-io/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('transformSupplier — fulfil-io', () => {
  const raw: RawFulfilParty = {
    id: 20,
    name: 'Acme Supplies',
    email: 'orders@acme.example',
    phone: '+14155550199',
    supplier: true,
    supplier_currency: [2, 'USD'],
    supplier_payment_term: [1, 'Net 30'],
    active: true,
    create_date: '2024-03-01T00:00:00Z',
  }
  const result = transformSupplier(raw)

  it('maps id from raw.id as string', () => {
    expect(result.id).toBe('20')
  })

  it('maps name', () => {
    expect(result.name).toBe('Acme Supplies')
  })

  it('maps email', () => {
    expect(result.email).toBe('orders@acme.example')
  })

  it('maps phone', () => {
    expect(result.phone).toBe('+14155550199')
  })

  it('maps defaultCurrency from supplier_currency m2o name', () => {
    expect(result.defaultCurrency).toBe('USD')
  })

  it('maps isActive from active boolean', () => {
    expect(result.isActive).toBe(true)
  })

  it('sets platform to fulfil-io', () => {
    expect(result.platform).toBe('fulfil-io')
  })

  it('passes schema validation', () => {
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})

describe('transformSupplier — fulfil-io inactive', () => {
  const raw: RawFulfilParty = { id: 21, name: 'Old Vendor', active: false }
  const result = transformSupplier(raw)

  it('maps isActive: false', () => {
    expect(result.isActive).toBe(false)
  })

  it('leaves defaultCurrency undefined when supplier_currency absent', () => {
    expect(result.defaultCurrency).toBeUndefined()
  })

  it('passes schema validation', () => {
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})

describe('transformSupplier — fulfil-io defaults when active absent', () => {
  const raw: RawFulfilParty = { id: 22 }
  const result = transformSupplier(raw)

  it('defaults isActive to true when active is undefined', () => {
    expect(result.isActive).toBe(true)
  })

  it('passes schema validation', () => {
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
