import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawKinaxisPart,
} from '../../../../../../../src/verticals/inventory/adapters/kinaxis/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('kinaxis transformProduct', () => {
  const raw: RawKinaxisPart = {
    id: 'part-uuid-001',
    partNumber: 'PN-12345',
    description: 'Hydraulic Pump Assembly',
    uom: 'each',
    partType: 'Purchased',
    status: 'Active',
    weightKg: 2.5,
    primarySupplierId: 'sup-001',
    supplierParts: [{ supplierId: 'sup-002' }],
    creationDate: '2024-03-01T00:00:00Z',
    lastModifiedDate: '2024-03-01T00:00:00Z',
  }

  it('maps id from raw.id', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('part-uuid-001')
    expect(result.externalId).toBe('part-uuid-001')
  })

  it('maps sku from partNumber', () => {
    const result = transformProduct(raw)
    expect(result.sku).toBe('PN-12345')
  })

  it('falls back to id when partNumber is missing', () => {
    const result = transformProduct({ id: 'x', partNumber: undefined })
    expect(result.sku).toBe('x')
  })

  it('maps name from description', () => {
    const result = transformProduct(raw)
    expect(result.name).toBe('Hydraulic Pump Assembly')
  })

  it('maps unitOfMeasure from uom', () => {
    const result = transformProduct(raw)
    expect(result.unitOfMeasure).toBe('each')
  })

  it('defaults unitOfMeasure to each when uom is missing', () => {
    const result = transformProduct({ id: 'x' })
    expect(result.unitOfMeasure).toBe('each')
  })

  it('converts weightKg to weightGrams', () => {
    const result = transformProduct(raw)
    expect(result.weightGrams).toBe(2500)
  })

  it('deduplicates and collects supplierIds', () => {
    const result = transformProduct(raw)
    expect(result.supplierIds).toEqual(['sup-001', 'sup-002'])
  })

  it('does not duplicate primarySupplierId if also in supplierParts', () => {
    const result = transformProduct({
      ...raw,
      supplierParts: [{ supplierId: 'sup-001' }, { supplierId: 'sup-002' }],
    })
    expect(result.supplierIds).toEqual(['sup-001', 'sup-002'])
  })

  it('sets isActive true when status=Active', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when status=Inactive', () => {
    const result = transformProduct({ ...raw, status: 'Inactive' })
    expect(result.isActive).toBe(false)
  })

  it('does not set retailPrice (not available on Kinaxis Part)', () => {
    const result = transformProduct(raw)
    expect(result.retailPrice).toBeUndefined()
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformProduct(raw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to kinaxis', () => {
    const result = transformProduct(raw)
    expect(result.platform).toBe('kinaxis')
  })

  it('produces output that satisfies ProductSchema', () => {
    expect(() => ProductSchema.parse(transformProduct(raw))).not.toThrow()
  })
})
