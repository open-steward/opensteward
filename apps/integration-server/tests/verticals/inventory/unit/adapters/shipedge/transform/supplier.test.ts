import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawShipEdgeSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/shipedge/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('shipedge transformSupplier', () => {
  const raw: RawShipEdgeSupplier = {
    supplier_name: 'Acme Supplies',
  }

  it('uses supplier_name as id and externalId', () => {
    const result = transformSupplier(raw)
    expect(result.id).toBe('Acme Supplies')
    expect(result.externalId).toBe('Acme Supplies')
  })

  it('uses supplier_name as name', () => {
    const result = transformSupplier(raw)
    expect(result.name).toBe('Acme Supplies')
  })

  it('hardcodes isActive to true (no flag in API)', () => {
    const result = transformSupplier(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets email to undefined (not in API response)', () => {
    const result = transformSupplier(raw)
    expect(result.email).toBeUndefined()
  })

  it('sets platform to shipedge', () => {
    const result = transformSupplier(raw)
    expect(result.platform).toBe('shipedge')
  })

  it('satisfies SupplierSchema', () => {
    expect(() => SupplierSchema.parse(transformSupplier(raw))).not.toThrow()
  })
})
