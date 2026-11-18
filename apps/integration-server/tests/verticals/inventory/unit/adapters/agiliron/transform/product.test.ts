import { describe, it, expect } from 'vitest'
import { transformProduct } from '../../../../../../../src/verticals/inventory/adapters/agiliron/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('transformProduct', () => {
  const raw = {
    ProductId: 'P001',
    ProductCode: 'WK-2026',
    ProductName: 'Wireless Keyboard',
    Description: 'Bluetooth keyboard',
    WeightMajor: 2,
    WeightMinor: 50,
    Length: 44,
    Width: 13,
    Height: 3,
    Discontinued: false,
    CreatedTimeUTC: '2024-03-01T00:00:00Z',
    PreferredVendor: 'VEN-01',
  }

  it('maps ProductId, ProductCode, and ProductName', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('P001')
    expect(result.sku).toBe('WK-2026')
    expect(result.name).toBe('Wireless Keyboard')
    expect(result.platform).toBe('agiliron')
  })

  it('converts WeightMajor/WeightMinor (lbs) to grams', () => {
    // 2 lbs + 50/100 = 2.5 lbs → Math.round(2.5 * 453.592) = 1134
    const result = transformProduct(raw)
    expect(result.weightGrams).toBe(1134)
  })

  it('sets isActive from Discontinued flag', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)

    const discontinued = transformProduct({ ...raw, Discontinued: true })
    expect(discontinued.isActive).toBe(false)
  })

  it('maps PreferredVendor to supplierIds', () => {
    const result = transformProduct(raw)
    expect(result.supplierIds[0]).toBe('VEN-01')
  })

  it('produces output that satisfies ProductSchema', () => {
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
