import { describe, it, expect } from 'vitest'
import { transformSupplier } from '../../../../../../../src/verticals/inventory/adapters/pipe17/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('transformSupplier — pipe17 supplier', () => {
  const raw = {
    supplierId: 'sup_55',
    name: 'Keyboards Inc',
    email: 'orders@keyboards.example',
    phone: '+14155550199',
    currency: 'USD',
    leadTimeDays: 14,
    status: 'active',
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-01T00:00:00Z',
  }
  const result = transformSupplier(raw)

  it('sets id from supplierId', () => {
    expect(result.id).toBe('sup_55')
  })

  it('sets externalId matching id', () => {
    expect(result.externalId).toBe('sup_55')
  })

  it('sets name from raw.name', () => {
    expect(result.name).toBe('Keyboards Inc')
  })

  it('sets email', () => {
    expect(result.email).toBe('orders@keyboards.example')
  })

  it('sets phone', () => {
    expect(result.phone).toBe('+14155550199')
  })

  it('sets defaultCurrency', () => {
    expect(result.defaultCurrency).toBe('USD')
  })

  it('sets defaultLeadTimeDays from leadTimeDays', () => {
    expect(result.defaultLeadTimeDays).toBe(14)
  })

  it('derives isActive from status not being inactive/archived', () => {
    expect(result.isActive).toBe(true)
  })

  it('sets platform to pipe17', () => {
    expect(result.platform).toBe('pipe17')
  })

  it('passes schema validation', () => {
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})

describe('transformSupplier — status=inactive', () => {
  const result = transformSupplier({ supplierId: 's2', name: 'Old Supplier', status: 'inactive' })

  it('sets isActive to false when status is inactive', () => {
    expect(result.isActive).toBe(false)
  })

  it('passes schema validation', () => {
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})

describe('transformSupplier — active field fallback', () => {
  it('uses active field when status absent and active=false', () => {
    const result = transformSupplier({ supplierId: 's3', name: 'Inactive', active: false })
    expect(result.isActive).toBe(false)
  })

  it('defaults isActive to true when both status and active absent', () => {
    const result = transformSupplier({ supplierId: 's4', name: 'Minimal' })
    expect(result.isActive).toBe(true)
  })
})
