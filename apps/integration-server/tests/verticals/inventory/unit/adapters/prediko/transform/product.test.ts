import { describe, it, expect } from 'vitest'
import { transformProduct } from '../../../../../../../src/verticals/inventory/adapters/prediko/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('transformProduct — prediko SKU', () => {
  const raw = {
    sku_id: 'sku_001',
    sku_name: 'WK-2026',
    product_name: 'Wireless Keyboard',
    supplier_name: 'Keyboards Inc',
    unit_cost: 45.0,
    unit_cost_supplier: 40.0,
    re_order_status: true,
    recommended_units_to_order: 200,
    sum_stock_level: 100,
    sum_incoming_units: 50,
    lead_time_to: '2024-03-01T00:00:00Z',
  }
  const result = transformProduct(raw)

  it('sets id from sku_id', () => {
    expect(result.id).toBe('sku_001')
  })

  it('sets externalId matching id', () => {
    expect(result.externalId).toBe('sku_001')
  })

  it('sets sku from sku_name', () => {
    expect(result.sku).toBe('WK-2026')
  })

  it('sets name from product_name', () => {
    expect(result.name).toBe('Wireless Keyboard')
  })

  it('sets unitOfMeasure to each (hardcoded — Prediko SKU endpoint has no UOM)', () => {
    expect(result.unitOfMeasure).toBe('each')
  })

  it('sets isActive to true (hardcoded)', () => {
    expect(result.isActive).toBe(true)
  })

  it('uses supplier_name as supplierIds entry (no supplier ID in Prediko SKU response)', () => {
    expect(result.supplierIds).toEqual(['Keyboards Inc'])
  })

  it('leaves description undefined (not in SKU endpoint response)', () => {
    expect(result.description).toBeUndefined()
  })

  it('leaves weightGrams undefined', () => {
    expect(result.weightGrams).toBeUndefined()
  })

  it('sets platform to prediko', () => {
    expect(result.platform).toBe('prediko')
  })

  it('stores unitCost in metadata', () => {
    expect(result.metadata['unitCost']).toBe('45')
  })

  it('stores reOrderStatus in metadata', () => {
    expect(result.metadata['reOrderStatus']).toBe('true')
  })

  it('passes schema validation', () => {
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('transformProduct — id fallback to sku_name', () => {
  const result = transformProduct({ sku_name: 'SKU-ONLY', product_name: 'Only by name' })

  it('falls back id to sku_name when sku_id absent', () => {
    expect(result.id).toBe('SKU-ONLY')
  })

  it('sets sku from sku_name', () => {
    expect(result.sku).toBe('SKU-ONLY')
  })
})

describe('transformProduct — name fallback to sku_name', () => {
  const result = transformProduct({ sku_id: 'x', sku_name: 'WK-2026' })

  it('sets name to sku_name when product_name absent', () => {
    expect(result.name).toBe('WK-2026')
  })

  it('sets supplierIds to empty array when supplier_name absent', () => {
    expect(result.supplierIds).toEqual([])
  })

  it('passes schema validation', () => {
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
