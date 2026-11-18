import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawExtensivProduct,
} from '../../../../../../../src/verticals/inventory/adapters/extensiv-order-manager/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('extensiv-order-manager transformProduct', () => {
  const raw: RawExtensivProduct = {
    productId: 101,
    masterSku: 'WK-2026',
    name: 'Wireless Keyboard',
    description: 'Bluetooth keyboard, US layout',
    upc: '0123456789012',
    mpn: 'WK2026-US',
    brand: 'Keyboards Inc',
    type: 'PRODUCT',
    active: true,
    parentId: null,
    weight: 16, // 16 oz = 453.592 g
    length: 18,
    width: 6,
    height: 2,
    vendorCost: { amount: 2500, currency: 'USD' },
    createdDate: '2024-03-01T00:00:00Z',
    modifiedDate: '2024-03-01T00:00:00Z',
    categories: ['Peripherals'],
    bundle: false,
    digital: false,
    hazmat: false,
  }

  it('maps id and externalId from productId', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('101')
    expect(result.externalId).toBe('101')
  })

  it('maps sku from masterSku', () => {
    const result = transformProduct(raw)
    expect(result.sku).toBe('WK-2026')
  })

  it('maps name', () => {
    const result = transformProduct(raw)
    expect(result.name).toBe('Wireless Keyboard')
  })

  it('maps description', () => {
    const result = transformProduct(raw)
    expect(result.description).toBe('Bluetooth keyboard, US layout')
  })

  it('maps upc', () => {
    const result = transformProduct(raw)
    expect(result.upc).toBe('0123456789012')
  })

  it('maps brand', () => {
    const result = transformProduct(raw)
    expect(result.brand).toBe('Keyboards Inc')
  })

  it('maps category from first categories entry', () => {
    const result = transformProduct(raw)
    expect(result.category).toBe('Peripherals')
  })

  it('converts weight in oz to grams', () => {
    const result = transformProduct(raw)
    // 16 oz * 28.3495 g/oz = 453.592 g rounded
    expect(result.weightGrams).toBe(Math.round(16 * 28.3495))
  })

  it('converts dimensions from inches to cm', () => {
    const result = transformProduct(raw)
    expect(result.dimensionsCm?.length).toBeCloseTo(18 * 2.54, 1)
    expect(result.dimensionsCm?.width).toBeCloseTo(6 * 2.54, 1)
    expect(result.dimensionsCm?.height).toBeCloseTo(2 * 2.54, 1)
  })

  it('maps retailPrice from vendorCost integer minor units', () => {
    const result = transformProduct(raw)
    expect(result.retailPrice).toEqual({ amount: 2500, currency: 'USD' })
  })

  it('maps isActive from active', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('maps createdAt from createdDate', () => {
    const result = transformProduct(raw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps updatedAt from modifiedDate', () => {
    const result = transformProduct(raw)
    expect(result.updatedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps parentProductId from parentId', () => {
    const result = transformProduct({ ...raw, parentId: 99 })
    expect(result.parentProductId).toBe('99')
  })

  it('sets parentProductId undefined when parentId is null', () => {
    const result = transformProduct(raw)
    expect(result.parentProductId).toBeUndefined()
  })

  it('sets platform to extensiv-order-manager', () => {
    const result = transformProduct(raw)
    expect(result.platform).toBe('extensiv-order-manager')
  })

  it('produces output that satisfies ProductSchema', () => {
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
