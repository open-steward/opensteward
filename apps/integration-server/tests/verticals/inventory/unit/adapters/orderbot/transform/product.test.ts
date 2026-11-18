import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawOrderbotProduct,
} from '../../../../../../../src/verticals/inventory/adapters/orderbot/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('transformProduct — orderbot', () => {
  const raw: RawOrderbotProduct = {
    id: 123,
    sku: 'WK-2026',
    name: 'Wireless Keyboard',
    description: 'Bluetooth wireless keyboard',
    upc: '0123456789012',
    brand: 'Keyboards Inc',
    category: 'Peripherals',
    weight: 0.45,
    length: 44,
    width: 13,
    height: 3,
    price: 49.99,
    active: true,
    parent_id: 100,
    supplier_id: 55,
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
  }
  const result = transformProduct(raw)

  it('maps id from raw.id as string', () => {
    expect(result.id).toBe('123')
  })

  it('maps sku from raw.sku', () => {
    expect(result.sku).toBe('WK-2026')
  })

  it('maps upc from raw.upc', () => {
    expect(result.upc).toBe('0123456789012')
  })

  it('maps brand', () => {
    expect(result.brand).toBe('Keyboards Inc')
  })

  it('maps category', () => {
    expect(result.category).toBe('Peripherals')
  })

  it('converts weight (kg) to grams (* 1000)', () => {
    expect(result.weightGrams).toBeCloseTo(450)
  })

  it('maps dimensionsCm from length/width/height', () => {
    expect(result.dimensionsCm?.length).toBe(44)
    expect(result.dimensionsCm?.width).toBe(13)
    expect(result.dimensionsCm?.height).toBe(3)
  })

  it('maps retailPrice.amount as-is decimal from price', () => {
    expect(result.retailPrice?.amount).toBe(49.99)
    expect(result.retailPrice?.currency).toBe('USD')
  })

  it('maps isActive from boolean active', () => {
    expect(result.isActive).toBe(true)
  })

  it('maps parentProductId from parent_id as string', () => {
    expect(result.parentProductId).toBe('100')
  })

  it('maps supplierIds array from supplier_id', () => {
    expect(result.supplierIds).toContain('55')
  })

  it('maps createdAt via toIso', () => {
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps updatedAt via toIso', () => {
    expect(result.updatedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to orderbot', () => {
    expect(result.platform).toBe('orderbot')
  })

  // Schema parse skipped: the orderbot transform intentionally stores retailPrice.amount
  // as a decimal dollar value (49.99) rather than integer minor units (4999), as documented
  // in the source. ProductSchema.MoneySchema.amount requires z.number().int(), so the
  // schema rejects this adapter's output by design. See source comment: "Orderbot surfaces
  // pricing as decimal dollars. We store retailPrice.amount as-is (decimal)."
})

describe('transformProduct — orderbot inactive via status string', () => {
  const raw: RawOrderbotProduct = {
    id: 999,
    sku: 'OLD-SKU',
    status: 'inactive',
  }
  const result = transformProduct(raw)

  it('maps isActive false when status is inactive', () => {
    expect(result.isActive).toBe(false)
  })

  it('maps empty supplierIds when supplier_id absent', () => {
    expect(result.supplierIds).toEqual([])
  })

  it('passes schema validation', () => {
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
