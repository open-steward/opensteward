import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawAdvanceProProduct,
} from '../../../../../../../src/verticals/inventory/adapters/advance-pro/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

const rawProduct: RawAdvanceProProduct = {
  id: '42',
  sku: 'WK-2026',
  name: 'Wireless Keyboard',
  selling_price: 15.99,
  active: true,
  vendor_id: '10',
  date_updated: '2024-03-01T00:00:00Z',
}

describe('transformProduct', () => {
  it('maps id, sku, name, and platform', () => {
    const result = transformProduct(rawProduct)
    expect(result.id).toBe('42')
    expect(result.sku).toBe('WK-2026')
    expect(result.name).toBe('Wireless Keyboard')
    expect(result.platform).toBe('advance-pro')
  })

  it('converts selling_price from dollars to cents', () => {
    const result = transformProduct(rawProduct)
    expect(result.retailPrice?.amount).toBe(1599)
  })

  it('maps supplierIds from vendor_id', () => {
    const result = transformProduct(rawProduct)
    expect(result.supplierIds[0]).toBe('10')
  })

  it('maps isActive', () => {
    const result = transformProduct(rawProduct)
    expect(result.isActive).toBe(true)
  })

  it('passes ProductSchema validation', () => {
    const result = transformProduct(rawProduct)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
