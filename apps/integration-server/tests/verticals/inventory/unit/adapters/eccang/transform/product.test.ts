import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawEccangProduct,
} from '../../../../../../../src/verticals/inventory/adapters/eccang/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('eccang transformProduct', () => {
  const raw: RawEccangProduct = {
    goods_id: 2001,
    goods_no: 'GN-2001',
    goods_name: '蓝牙耳机',
    goods_desc: 'Wireless Bluetooth Headphones',
    bar_code: '6901234567890',
    brand: 'AudioTech',
    category_name: 'Electronics',
    goods_type: 'physical',
    weight: 0.2,
    length: 20,
    width: 15,
    height: 8,
    // Use an integer sale_price so retailPrice.amount passes Amount (z.number().int())
    sale_price: 299,
    cost_price: 150,
    currency: 'CNY',
    is_enabled: true,
    parent_goods_id: 1000,
    sku_id: 3001,
    sku_no: 'SKU-3001',
    create_time: '2024-03-01T00:00:00.000Z',
    update_time: '2024-03-01T00:00:00.000Z',
  }

  it('maps id and externalId from goods_id as string', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('2001')
    expect(result.externalId).toBe('2001')
  })

  it('maps sku from sku_no when available', () => {
    const result = transformProduct(raw)
    expect(result.sku).toBe('SKU-3001')
  })

  it('falls back to goods_no for sku when sku_no absent', () => {
    const result = transformProduct({ ...raw, sku_no: undefined })
    expect(result.sku).toBe('GN-2001')
  })

  it('maps name from goods_name', () => {
    const result = transformProduct(raw)
    expect(result.name).toBe('蓝牙耳机')
  })

  it('maps description from goods_desc', () => {
    const result = transformProduct(raw)
    expect(result.description).toBe('Wireless Bluetooth Headphones')
  })

  it('maps upc from bar_code', () => {
    const result = transformProduct(raw)
    expect(result.upc).toBe('6901234567890')
  })

  it('maps brand from brand', () => {
    const result = transformProduct(raw)
    expect(result.brand).toBe('AudioTech')
  })

  it('maps category from category_name', () => {
    const result = transformProduct(raw)
    expect(result.category).toBe('Electronics')
  })

  it('hardcodes unitOfMeasure to each', () => {
    const result = transformProduct(raw)
    expect(result.unitOfMeasure).toBe('each')
  })

  it('converts weight kg to grams', () => {
    const result = transformProduct(raw)
    expect(result.weightGrams).toBe(200)
  })

  it('maps dimensionsCm from length/width/height', () => {
    const result = transformProduct(raw)
    expect(result.dimensionsCm?.length).toBe(20)
    expect(result.dimensionsCm?.width).toBe(15)
    expect(result.dimensionsCm?.height).toBe(8)
  })

  it('maps retailPrice.amount from sale_price as-is (not multiplied)', () => {
    const result = transformProduct(raw)
    // eccang stores price as raw value, not converted to minor units
    expect(result.retailPrice?.amount).toBe(299)
    expect(result.retailPrice?.currency).toBe('CNY')
  })

  it('maps isActive from is_enabled', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when is_enabled is false', () => {
    const result = transformProduct({ ...raw, is_enabled: false })
    expect(result.isActive).toBe(false)
  })

  it('maps parentProductId from parent_goods_id as string', () => {
    const result = transformProduct(raw)
    expect(result.parentProductId).toBe('1000')
  })

  it('always returns empty supplierIds array', () => {
    const result = transformProduct(raw)
    expect(result.supplierIds).toEqual([])
  })

  it('maps createdAt from create_time', () => {
    const result = transformProduct(raw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps updatedAt from update_time', () => {
    const result = transformProduct(raw)
    expect(result.updatedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to eccang', () => {
    const result = transformProduct(raw)
    expect(result.platform).toBe('eccang')
  })

  it('produces output that satisfies ProductSchema', () => {
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
