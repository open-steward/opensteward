import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawXentralProduct,
} from '../../../../../../../src/verticals/inventory/adapters/xentral/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

const rawProduct: RawXentralProduct = {
  id: 'prod-99',
  uuid: 'aaaa-bbbb-cccc',
  number: 'ART-001',
  name: 'Blaues Gadget',
  description: 'Ein blaues Gadget für Tests',
  ean: '4000000000001',
  manufacturerName: 'Gadget GmbH',
  category: { id: 'cat-1', name: 'Gadgets' },
  unit: { name: 'each' },
  measurements: {
    weight: { value: 0.5, unit: 'kg' }, // 0.5 kg → 500 g
    length: { value: 30, unit: 'cm' },
    width: { value: 10, unit: 'cm' },
    height: { value: 5, unit: 'cm' },
  },
  salesPriceNet: { amount: '12.50', currency: 'EUR' },
  isDisabled: false,
  isStockItem: true,
  standardSupplier: { id: 'sup-7' },
  updatedAt: '2024-03-01T00:00:00Z',
}

describe('xentral transformProduct', () => {
  it('maps id to id and externalId', () => {
    const result = transformProduct(rawProduct)
    expect(result.id).toBe('prod-99')
    expect(result.externalId).toBe('prod-99')
  })

  it('maps number to sku', () => {
    const result = transformProduct(rawProduct)
    expect(result.sku).toBe('ART-001')
  })

  it('maps name to name', () => {
    const result = transformProduct(rawProduct)
    expect(result.name).toBe('Blaues Gadget')
  })

  it('maps ean to upc', () => {
    const result = transformProduct(rawProduct)
    expect(result.upc).toBe('4000000000001')
  })

  it('maps manufacturerName to brand', () => {
    const result = transformProduct(rawProduct)
    expect(result.brand).toBe('Gadget GmbH')
  })

  it('maps category.name to category', () => {
    const result = transformProduct(rawProduct)
    expect(result.category).toBe('Gadgets')
  })

  it('converts weight from kg to grams (0.5 kg → 500 g)', () => {
    const result = transformProduct(rawProduct)
    expect(result.weightGrams).toBe(500)
  })

  it('maps dimensions in cm', () => {
    const result = transformProduct(rawProduct)
    expect(result.dimensionsCm?.length).toBe(30)
    expect(result.dimensionsCm?.width).toBe(10)
    expect(result.dimensionsCm?.height).toBe(5)
  })

  it('converts salesPriceNet.amount string float to integer minor units', () => {
    const result = transformProduct(rawProduct)
    // "12.50" → Math.round(12.50 * 100) = 1250
    expect(result.retailPrice?.amount).toBe(1250)
    expect(result.retailPrice?.currency).toBe('EUR')
  })

  it('inverts isDisabled to isActive', () => {
    const result = transformProduct(rawProduct)
    expect(result.isActive).toBe(true)
  })

  it('maps standardSupplier.id into supplierIds', () => {
    const result = transformProduct(rawProduct)
    expect(result.supplierIds).toContain('sup-7')
  })

  it('maps updatedAt to updatedAt as ISO string', () => {
    const result = transformProduct(rawProduct)
    expect(result.updatedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform=xentral', () => {
    const result = transformProduct(rawProduct)
    expect(result.platform).toBe('xentral')
  })

  it('produces a schema-valid Product', () => {
    const result = transformProduct(rawProduct)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('sets parentProductId when isVariant=true', () => {
    const result = transformProduct({
      ...rawProduct,
      isVariant: true,
      variantOf: { id: 'prod-10' },
    })
    expect(result.parentProductId).toBe('prod-10')
  })

  it('does not set parentProductId when isVariant=false', () => {
    const result = transformProduct({
      ...rawProduct,
      isVariant: false,
      variantOf: { id: 'prod-10' },
    })
    expect(result.parentProductId).toBeUndefined()
  })
})
