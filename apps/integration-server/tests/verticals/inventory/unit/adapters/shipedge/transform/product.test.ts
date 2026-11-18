import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawShipEdgeProduct,
} from '../../../../../../../src/verticals/inventory/adapters/shipedge/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('shipedge transformProduct', () => {
  const raw: RawShipEdgeProduct = {
    product_id: 'SE-PROD-100',
    sku: 'WKB-100',
    upc: '0099887766554',
    description: 'Ergonomic Keyboard',
    weight: 2,
    length: 17,
    width: 6,
    height: 1.5,
    cost: 20.0,
    retail: 49.95,
    distribution_center: { id: 7, name: 'Main DC' },
    supplier: { id: '55', name: 'KeySupplier' },
    package_type: { id: '1', name: 'Box' },
    quantity_available: 150,
    quantity_in_warehouse: 200,
    quantity_hurt: 5,
    quantity_shipped: 10,
    harmonization_code: '8471.60.2000',
    discontinued: false,
    created_date: '2024-03-01T00:00:00Z',
    updated_date: '2024-06-01T00:00:00Z',
  }

  it('maps product_id to id and externalId', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('SE-PROD-100')
    expect(result.externalId).toBe('SE-PROD-100')
  })

  it('maps sku to sku', () => {
    const result = transformProduct(raw)
    expect(result.sku).toBe('WKB-100')
  })

  it('maps description to name', () => {
    const result = transformProduct(raw)
    expect(result.name).toBe('Ergonomic Keyboard')
  })

  it('converts weight lbs to grams', () => {
    const result = transformProduct(raw)
    expect(result.weightGrams).toBe(Math.round(2 * 453.592))
  })

  it('converts dimensions inches to cm', () => {
    const result = transformProduct(raw)
    expect(result.dimensionsCm?.length).toBeCloseTo(17 * 2.54)
    expect(result.dimensionsCm?.width).toBeCloseTo(6 * 2.54)
    expect(result.dimensionsCm?.height).toBeCloseTo(1.5 * 2.54)
  })

  it('converts retail dollars to cents', () => {
    const result = transformProduct(raw)
    expect(result.retailPrice?.amount).toBe(Math.round(49.95 * 100))
    expect(result.retailPrice?.currency).toBe('USD')
  })

  it('maps supplier.id to supplierIds', () => {
    const result = transformProduct(raw)
    expect(result.supplierIds).toContain('55')
  })

  it('sets isActive true when discontinued is false', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when discontinued is true', () => {
    const disc: RawShipEdgeProduct = { ...raw, discontinued: true }
    expect(transformProduct(disc).isActive).toBe(false)
  })

  it('maps created_date to createdAt', () => {
    const result = transformProduct(raw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('satisfies ProductSchema', () => {
    expect(() => ProductSchema.parse(transformProduct(raw))).not.toThrow()
  })
})
