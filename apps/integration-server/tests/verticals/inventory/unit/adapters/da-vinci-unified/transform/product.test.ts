import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawDaVinciUnifiedProduct,
} from '../../../../../../../src/verticals/inventory/adapters/da-vinci-unified/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('da-vinci-unified transformProduct', () => {
  const raw: RawDaVinciUnifiedProduct = {
    itemId: 'item-001',
    itemNumber: 'SKU-001',
    description: 'Wireless Keyboard',
    extendedDescription: 'Bluetooth wireless keyboard, US layout.',
    upc: '012345678901',
    vendorId: 'vendor-99',
    categoryCode: 'Peripherals',
    unitOfMeasure: 'each',
    unitWeight: 1,
    unitLength: 10,
    unitWidth: 5,
    unitHeight: 2,
    retailPrice: 50,
    isActive: true,
    createDate: '2024-03-01T00:00:00Z',
    lastModifiedDate: '2024-03-01T00:00:00Z',
  }

  it('maps id and externalId from itemId', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('item-001')
    expect(result.externalId).toBe('item-001')
  })

  it('maps sku from itemNumber', () => {
    const result = transformProduct(raw)
    expect(result.sku).toBe('SKU-001')
  })

  it('maps name from description', () => {
    const result = transformProduct(raw)
    expect(result.name).toBe('Wireless Keyboard')
  })

  it('converts weight from lbs to grams', () => {
    const result = transformProduct(raw)
    // 1 lb * 453.592 g/lb = 453.592 -> Math.round = 454
    expect(result.weightGrams).toBe(Math.round(1 * 453.592))
  })

  it('converts dimensions from inches to cm', () => {
    const result = transformProduct(raw)
    expect(result.dimensionsCm?.length).toBeCloseTo(10 * 2.54)
    expect(result.dimensionsCm?.width).toBeCloseTo(5 * 2.54)
    expect(result.dimensionsCm?.height).toBeCloseTo(2 * 2.54)
  })

  it('maps retailPrice as raw decimal USD (not cents)', () => {
    const result = transformProduct({ ...raw, retailPrice: 49.99 })
    expect(result.retailPrice).toEqual({ amount: 49.99, currency: 'USD' })
  })

  it('maps supplierIds from vendorId', () => {
    const result = transformProduct(raw)
    expect(result.supplierIds).toEqual(['vendor-99'])
  })

  it('defaults isActive to true when absent', () => {
    const result = transformProduct({ itemId: 'item-002' })
    expect(result.isActive).toBe(true)
  })

  it('sets platform to da-vinci-unified', () => {
    const result = transformProduct(raw)
    expect(result.platform).toBe('da-vinci-unified')
  })

  it('leaves dimensionsCm undefined when no dimension fields provided', () => {
    const result = transformProduct({
      itemId: 'item-003',
      itemNumber: 'SKU-003',
      description: 'Widget',
    })
    expect(result.dimensionsCm).toBeUndefined()
  })

  it('produces output that satisfies ProductSchema', () => {
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
