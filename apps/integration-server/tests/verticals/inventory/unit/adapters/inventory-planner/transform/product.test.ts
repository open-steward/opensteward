import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawInventoryPlannerVariant,
} from '../../../../../../../src/verticals/inventory/adapters/inventory-planner/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('inventory-planner transformProduct', () => {
  const raw: RawInventoryPlannerVariant = {
    _id: 'abc123def456',
    sku: 'SKU-001',
    product_title: 'Wireless Keyboard',
    title: 'Wireless Keyboard - Blue',
    barcode: '012345678901',
    vendor: 'KeyboardCo',
    vendor_id: 'vendor-001',
    // Use integer prices so MoneySchema (amount: z.number().int()) passes
    price: 6000,
    cost: 2500,
    currency: 'USD',
    archived: false,
    lead_time: 14,
    review_period: 7,
    replenishment: 100,
    created_at: '2024-03-01T00:00:00Z',
  }

  it('maps id and externalId from _id', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('abc123def456')
    expect(result.externalId).toBe('abc123def456')
  })

  it('maps sku', () => {
    const result = transformProduct(raw)
    expect(result.sku).toBe('SKU-001')
  })

  it('maps name from product_title', () => {
    const result = transformProduct(raw)
    expect(result.name).toBe('Wireless Keyboard')
  })

  it('maps description from title when it differs from product_title', () => {
    const result = transformProduct(raw)
    expect(result.description).toBe('Wireless Keyboard - Blue')
  })

  it('omits description when title equals product_title', () => {
    const result = transformProduct({
      ...raw,
      title: 'Wireless Keyboard',
      product_title: 'Wireless Keyboard',
    })
    expect(result.description).toBeUndefined()
  })

  it('maps upc from barcode', () => {
    const result = transformProduct(raw)
    expect(result.upc).toBe('012345678901')
  })

  it('maps brand from vendor', () => {
    const result = transformProduct(raw)
    expect(result.brand).toBe('KeyboardCo')
  })

  it('maps retailPrice and cost with currency', () => {
    const result = transformProduct(raw)
    expect(result.retailPrice?.amount).toBe(6000)
    expect(result.retailPrice?.currency).toBe('USD')
    expect(result.cost?.amount).toBe(2500)
    expect(result.cost?.currency).toBe('USD')
  })

  it('maps supplierIds from vendor_id', () => {
    const result = transformProduct(raw)
    expect(result.supplierIds).toEqual(['vendor-001'])
  })

  it('maps isActive true when archived is false', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('maps isActive false when archived is true', () => {
    const result = transformProduct({ ...raw, archived: true })
    expect(result.isActive).toBe(false)
  })

  it('sets platform to inventory-planner', () => {
    const result = transformProduct(raw)
    expect(result.platform).toBe('inventory-planner')
  })

  it('produces output that satisfies ProductSchema', () => {
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
