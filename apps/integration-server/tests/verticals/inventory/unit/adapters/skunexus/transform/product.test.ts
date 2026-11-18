import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawSkuNexusProduct,
} from '../../../../../../../src/verticals/inventory/adapters/skunexus/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('skunexus transformProduct', () => {
  const raw: RawSkuNexusProduct = {
    id: '101',
    sku: 'WK-2026',
    name: 'Wireless Keyboard',
    description: 'Bluetooth keyboard',
    unit_of_measure: 'each',
    weight: 1,
    weight_unit: 'lb',
    unit_price: 5,
    currency: 'USD',
    active: true,
    vendor_id: 'V10',
    vendor_ids: ['V10', 'V20'],
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
  }

  it('maps id, sku, and name', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('101')
    expect(result.sku).toBe('WK-2026')
    expect(result.name).toBe('Wireless Keyboard')
    expect(result.platform).toBe('skunexus')
  })

  it('converts weight in lbs to grams', () => {
    // 1 lb → Math.round(1 * 453.592) = 454
    const result = transformProduct(raw)
    expect(result.weightGrams).toBe(454)
  })

  it('converts weight in kg to grams', () => {
    const result = transformProduct({ ...raw, weight: 2, weight_unit: 'kg' })
    expect(result.weightGrams).toBe(2000)
  })

  it('deduplicates vendor_id and vendor_ids into supplierIds', () => {
    const result = transformProduct(raw)
    expect(result.supplierIds).toEqual(['V10', 'V20'])
  })

  it('sets isActive from active flag', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)

    const inactive = transformProduct({ ...raw, active: false })
    expect(inactive.isActive).toBe(false)
  })

  it('archived=true overrides active and marks isActive=false', () => {
    const result = transformProduct({ ...raw, archived: true })
    expect(result.isActive).toBe(false)
  })

  it('maps createdAt and updatedAt as ISO strings', () => {
    const result = transformProduct(raw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('produces output satisfying ProductSchema (integer unit_price)', () => {
    // unit_price=5 is an integer so Amount (z.number().int()) passes
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('omits retailPrice when unit_price is absent', () => {
    const result = transformProduct({ ...raw, unit_price: undefined })
    expect(result.retailPrice).toBeUndefined()
  })
})
