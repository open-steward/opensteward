import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawFulfilProduct,
} from '../../../../../../../src/verticals/inventory/adapters/fulfil-io/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('transformProduct — fulfil-io', () => {
  // Use lowercase UOM ('each') and integer list_price so the canonical schema
  // accepts the result. Fulfil stores list_price as-is without minor-unit
  // conversion; when the upstream value happens to be an integer it passes the
  // Amount (z.number().int()) validator.
  const raw: RawFulfilProduct = {
    id: 55,
    code: 'WK-2024',
    rec_name: 'Wireless Keyboard (Black)',
    template: [10, 'Wireless Keyboard'],
    description: 'Compact Bluetooth keyboard',
    barcode: '0123456789012',
    brand: [3, 'KeyCo'],
    category: [7, 'Peripherals'],
    default_uom: [1, 'each'],
    weight: 0.45,
    list_price: 4999,
    currency: [2, 'USD'],
    active: true,
    purchase_party: [20, 'KeyCo Supplier'],
    create_date: '2024-03-01T00:00:00Z',
    write_date: '2024-03-01T00:00:00Z',
  }
  const result = transformProduct(raw)

  it('maps id from raw.id as string', () => {
    expect(result.id).toBe('55')
  })

  it('maps sku from code', () => {
    expect(result.sku).toBe('WK-2024')
  })

  it('maps name from rec_name', () => {
    expect(result.name).toBe('Wireless Keyboard (Black)')
  })

  it('maps upc from barcode', () => {
    expect(result.upc).toBe('0123456789012')
  })

  it('maps brand from brand m2o name', () => {
    expect(result.brand).toBe('KeyCo')
  })

  it('maps category from category m2o name', () => {
    expect(result.category).toBe('Peripherals')
  })

  it('converts weight kg to grams', () => {
    expect(result.weightGrams).toBeCloseTo(450)
  })

  it('maps retailPrice from list_price (stored as-is, not converted to minor units)', () => {
    expect(result.retailPrice?.amount).toBe(4999)
    expect(result.retailPrice?.currency).toBe('USD')
  })

  it('maps unitOfMeasure from default_uom m2o name', () => {
    expect(result.unitOfMeasure).toBe('each')
  })

  it('maps isActive from active boolean', () => {
    expect(result.isActive).toBe(true)
  })

  it('maps supplierIds from purchase_party m2o id', () => {
    expect(result.supplierIds).toEqual(['20'])
  })

  it('maps createdAt from create_date', () => {
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to fulfil-io', () => {
    expect(result.platform).toBe('fulfil-io')
  })

  it('passes schema validation', () => {
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('transformProduct — fulfil-io name fallback to template', () => {
  // No default_uom → unitOfMeasure will be 'each' (default). No list_price → no retailPrice.
  const raw: RawFulfilProduct = {
    id: 56,
    template: [10, 'Wireless Keyboard'],
    active: true,
  }
  const result = transformProduct(raw)

  it('falls back name to template m2o name when rec_name absent', () => {
    expect(result.name).toBe('Wireless Keyboard')
  })

  it('has empty supplierIds when purchase_party absent', () => {
    expect(result.supplierIds).toEqual([])
  })

  it('leaves retailPrice undefined when list_price absent', () => {
    expect(result.retailPrice).toBeUndefined()
  })

  it('passes schema validation', () => {
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
