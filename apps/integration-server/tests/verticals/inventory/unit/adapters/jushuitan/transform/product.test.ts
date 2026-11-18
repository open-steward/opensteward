import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawJushuitanProduct,
} from '../../../../../../../src/verticals/inventory/adapters/jushuitan/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('jushuitan transformProduct', () => {
  const raw: RawJushuitanProduct = {
    sku_id: 1001,
    i_id: 'SKU-ABC',
    sku_name: 'Blue Widget',
    cat_name: 'Widgets',
    brand: 'Acme',
    spec: 'Large, blue',
    barcode: '1234567890123',
    weight: 500,
    length: 10,
    width: 5,
    height: 3,
    sale_price: 2999,
    enabled: 1,
    supplier_id: 7,
    created: '2024-03-01T00:00:00Z',
    modified: '2024-03-01T00:00:00Z',
  }

  it('maps id from sku_id', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('1001')
    expect(result.externalId).toBe('1001')
  })

  it('maps sku from i_id', () => {
    const result = transformProduct(raw)
    expect(result.sku).toBe('SKU-ABC')
  })

  it('falls back to id when i_id is missing', () => {
    const result = transformProduct({ ...raw, i_id: undefined })
    expect(result.sku).toBe('1001')
  })

  it('maps name from sku_name', () => {
    const result = transformProduct(raw)
    expect(result.name).toBe('Blue Widget')
  })

  it('maps brand', () => {
    const result = transformProduct(raw)
    expect(result.brand).toBe('Acme')
  })

  it('maps category from cat_name', () => {
    const result = transformProduct(raw)
    expect(result.category).toBe('Widgets')
  })

  it('maps upc from barcode', () => {
    const result = transformProduct(raw)
    expect(result.upc).toBe('1234567890123')
  })

  it('maps weightGrams (already in grams)', () => {
    const result = transformProduct(raw)
    expect(result.weightGrams).toBe(500)
  })

  it('maps retailPrice in CNY fen minor units', () => {
    const result = transformProduct(raw)
    expect(result.retailPrice?.amount).toBe(2999)
    expect(result.retailPrice?.currency).toBe('CNY')
  })

  it('maps supplierIds from supplier_id', () => {
    const result = transformProduct(raw)
    expect(result.supplierIds).toEqual(['7'])
  })

  it('sets isActive true when enabled=1', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('maps dimensionsCm from length/width/height', () => {
    const result = transformProduct(raw)
    expect(result.dimensionsCm?.length).toBe(10)
    expect(result.dimensionsCm?.width).toBe(5)
    expect(result.dimensionsCm?.height).toBe(3)
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformProduct(raw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to jushuitan', () => {
    const result = transformProduct(raw)
    expect(result.platform).toBe('jushuitan')
  })

  it('produces output that satisfies ProductSchema', () => {
    expect(() => ProductSchema.parse(transformProduct(raw))).not.toThrow()
  })
})
