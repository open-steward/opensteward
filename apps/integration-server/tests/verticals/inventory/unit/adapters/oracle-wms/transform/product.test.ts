import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawOracleWmsItem,
} from '../../../../../../../src/verticals/inventory/adapters/oracle-wms/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('oracle-wms transformProduct', () => {
  const raw: RawOracleWmsItem = {
    item_id: 5001,
    item_number: 'WK-2026',
    description: 'Wireless Keyboard',
    std_uom: 'each',
    item_type: 'Finished Good',
    unit_weight: 1,
    weight_uom: 'KG',
    unit_length: 44,
    unit_width: 13,
    unit_height: 3,
    dim_uom: 'CM',
    default_vendor_id: 99,
    status: 'Active',
    company_id: 1,
    created_date_time: '2024-03-01T00:00:00Z',
    last_updated_date_time: '2024-03-01T00:00:00Z',
  }

  it('maps id and externalId from item_id', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('5001')
    expect(result.externalId).toBe('5001')
  })

  it('maps sku from item_number', () => {
    const result = transformProduct(raw)
    expect(result.sku).toBe('WK-2026')
  })

  it('maps name from description', () => {
    const result = transformProduct(raw)
    expect(result.name).toBe('Wireless Keyboard')
  })

  it('converts weight in KG to grams', () => {
    const result = transformProduct(raw)
    expect(result.weightGrams).toBe(1000)
  })

  it('converts weight in LB to grams', () => {
    const result = transformProduct({ ...raw, unit_weight: 1, weight_uom: 'LB' })
    expect(result.weightGrams).toBe(454)
  })

  it('maps dimensions in CM', () => {
    const result = transformProduct(raw)
    expect(result.dimensionsCm?.length).toBe(44)
    expect(result.dimensionsCm?.width).toBe(13)
    expect(result.dimensionsCm?.height).toBe(3)
  })

  it('converts dimensions from IN to CM', () => {
    const result = transformProduct({ ...raw, unit_length: 10, unit_width: 5, dim_uom: 'IN' })
    expect(result.dimensionsCm?.length).toBeCloseTo(25.4)
    expect(result.dimensionsCm?.width).toBeCloseTo(12.7)
  })

  it('maps supplierIds from default_vendor_id', () => {
    const result = transformProduct(raw)
    expect(result.supplierIds).toContain('99')
  })

  it('sets isActive true when status is Active', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when status is Inactive', () => {
    const result = transformProduct({ ...raw, status: 'Inactive' })
    expect(result.isActive).toBe(false)
  })

  it('maps createdAt from created_date_time', () => {
    const result = transformProduct(raw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to oracle-wms', () => {
    const result = transformProduct(raw)
    expect(result.platform).toBe('oracle-wms')
  })

  it('produces output that satisfies ProductSchema', () => {
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
