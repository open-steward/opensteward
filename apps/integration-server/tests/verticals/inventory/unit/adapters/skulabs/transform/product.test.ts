import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawSkulabsItem,
} from '../../../../../../../src/verticals/inventory/adapters/skulabs/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('skulabs transformProduct', () => {
  const raw: RawSkulabsItem = {
    _id: 'item-001',
    sku: 'SKL-KB-01',
    name: 'Mechanical Keyboard',
    upc: '0123456789012',
    weight: 2,
    weight_unit: 'lb',
    length: 18,
    width: 7,
    height: 2,
    dimensions_unit: 'in',
    cost: 30.0,
    wholesale: 40.0,
    retail: 79.99,
    active: true,
    supplies: [{ distributor_id: 'dist-100' }, { distributor_id: 'dist-200' }],
    barcodes: ['ALT-BARCODE-001'],
    tags: ['keyboard', 'mechanical'],
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-06-01T00:00:00Z',
  }

  it('maps _id to id and externalId', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('item-001')
    expect(result.externalId).toBe('item-001')
  })

  it('maps sku to sku', () => {
    const result = transformProduct(raw)
    expect(result.sku).toBe('SKL-KB-01')
  })

  it('maps name to name', () => {
    const result = transformProduct(raw)
    expect(result.name).toBe('Mechanical Keyboard')
  })

  it('maps upc to upc', () => {
    const result = transformProduct(raw)
    expect(result.upc).toBe('0123456789012')
  })

  it('falls back to barcodes[0] when upc absent', () => {
    const noUpc: RawSkulabsItem = { ...raw, upc: undefined }
    const result = transformProduct(noUpc)
    expect(result.upc).toBe('ALT-BARCODE-001')
  })

  it('converts lb weight to grams', () => {
    const result = transformProduct(raw)
    expect(result.weightGrams).toBeCloseTo(2 * 453.592)
  })

  it('converts oz weight (default unit) to grams', () => {
    const ozWeight: RawSkulabsItem = { ...raw, weight: 32, weight_unit: 'oz' }
    const result = transformProduct(ozWeight)
    expect(result.weightGrams).toBeCloseTo(32 * 28.3495)
  })

  it('converts inches dimensions to cm', () => {
    const result = transformProduct(raw)
    expect(result.dimensionsCm?.length).toBeCloseTo(18 * 2.54)
    expect(result.dimensionsCm?.width).toBeCloseTo(7 * 2.54)
    expect(result.dimensionsCm?.height).toBeCloseTo(2 * 2.54)
  })

  it('converts retail to cents', () => {
    const result = transformProduct(raw)
    expect(result.retailPrice?.amount).toBe(Math.round(79.99 * 100))
    expect(result.retailPrice?.currency).toBe('USD')
  })

  it('maps supplies distributor_id to supplierIds', () => {
    const result = transformProduct(raw)
    expect(result.supplierIds).toContain('dist-100')
    expect(result.supplierIds).toContain('dist-200')
    expect(result.supplierIds).toHaveLength(2)
  })

  it('maps active to isActive', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('defaults isActive to true when active is absent', () => {
    const noActive: RawSkulabsItem = { ...raw, active: undefined }
    expect(transformProduct(noActive).isActive).toBe(true)
  })

  it('maps created_at to createdAt', () => {
    const result = transformProduct(raw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('satisfies ProductSchema', () => {
    expect(() => ProductSchema.parse(transformProduct(raw))).not.toThrow()
  })
})
