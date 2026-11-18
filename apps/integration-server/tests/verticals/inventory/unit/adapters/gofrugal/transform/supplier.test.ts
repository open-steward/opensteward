import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawGofrugalSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/gofrugal/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('gofrugal transformSupplier', () => {
  const raw: RawGofrugalSupplier = {
    supplierId: 55,
    supplierName: 'Agro Traders Ltd',
    email: 'orders@agrotraders.example',
    phone: '+911234567890',
  }

  it('maps id and externalId from supplierId as string', () => {
    const result = transformSupplier(raw)
    expect(result.id).toBe('55')
    expect(result.externalId).toBe('55')
  })

  it('maps name from supplierName', () => {
    const result = transformSupplier(raw)
    expect(result.name).toBe('Agro Traders Ltd')
  })

  it('maps email and phone', () => {
    const result = transformSupplier(raw)
    expect(result.email).toBe('orders@agrotraders.example')
    expect(result.phone).toBe('+911234567890')
  })

  it('sets isActive to true', () => {
    const result = transformSupplier(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets platform to gofrugal', () => {
    const result = transformSupplier(raw)
    expect(result.platform).toBe('gofrugal')
  })

  it('defaults name to empty string when supplierName absent', () => {
    const result = transformSupplier({ supplierId: 1 })
    expect(result.name).toBe('')
  })

  it('produces output that satisfies SupplierSchema', () => {
    const result = transformSupplier(raw)
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
