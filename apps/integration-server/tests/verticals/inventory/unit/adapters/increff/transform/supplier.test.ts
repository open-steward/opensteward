import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawIncreffSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/increff/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('increff transformSupplier', () => {
  const raw: RawIncreffSupplier = {
    supplierCode: 'SUP-DC-01',
    name: 'DenimCo Manufacturers',
    email: 'supply@denimco.example',
    phone: '+911234567890',
    currency: 'INR',
    leadTimeDays: 14,
    status: 'active',
  }

  it('maps id and externalId from supplierCode', () => {
    const result = transformSupplier(raw)
    expect(result.id).toBe('SUP-DC-01')
    expect(result.externalId).toBe('SUP-DC-01')
  })

  it('maps name', () => {
    const result = transformSupplier(raw)
    expect(result.name).toBe('DenimCo Manufacturers')
  })

  it('maps defaultCurrency from currency', () => {
    const result = transformSupplier(raw)
    expect(result.defaultCurrency).toBe('INR')
  })

  it('maps defaultLeadTimeDays', () => {
    const result = transformSupplier(raw)
    expect(result.defaultLeadTimeDays).toBe(14)
  })

  it('sets isActive true when status is active', () => {
    const result = transformSupplier(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when status is inactive', () => {
    const result = transformSupplier({ ...raw, status: 'inactive' })
    expect(result.isActive).toBe(false)
  })

  it('sets platform to increff', () => {
    const result = transformSupplier(raw)
    expect(result.platform).toBe('increff')
  })

  it('falls back name to supplierCode when name absent', () => {
    const result = transformSupplier({ supplierCode: 'SUP-X', status: '' })
    expect(result.name).toBe('SUP-X')
  })

  it('produces output that satisfies SupplierSchema', () => {
    const result = transformSupplier(raw)
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
