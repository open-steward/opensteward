import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawFluentCommerceProduct,
} from '../../../../../../../src/verticals/inventory/adapters/fluent-commerce/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('transformProduct — fluent-commerce', () => {
  const raw: RawFluentCommerceProduct = {
    ref: 'SKU-WK-2024',
    name: 'Wireless Keyboard',
    gtin: '9781234567890',
    summary: 'A compact Bluetooth keyboard',
    type: 'VARIANT',
    status: 'ACTIVE',
    createdOn: '2024-03-01T00:00:00Z',
    updatedOn: '2024-03-01T00:00:00Z',
    prices: [{ type: 'RETAIL', value: 49.99, currency: 'USD' }],
    attributes: [
      { name: 'brand', value: 'KeyCo' },
      { name: 'category', value: 'Peripherals' },
    ],
  }
  const result = transformProduct(raw)

  it('maps id and sku from ref', () => {
    expect(result.id).toBe('SKU-WK-2024')
    expect(result.sku).toBe('SKU-WK-2024')
  })

  it('maps upc from gtin', () => {
    expect(result.upc).toBe('9781234567890')
  })

  it('maps description from summary', () => {
    expect(result.description).toBe('A compact Bluetooth keyboard')
  })

  it('converts RETAIL price to integer minor units', () => {
    expect(result.retailPrice?.amount).toBe(4999)
    expect(result.retailPrice?.currency).toBe('USD')
  })

  it('maps brand from attributes', () => {
    expect(result.brand).toBe('KeyCo')
  })

  it('maps category from attributes', () => {
    expect(result.category).toBe('Peripherals')
  })

  it('maps isActive: true when status is ACTIVE', () => {
    expect(result.isActive).toBe(true)
  })

  it('maps createdAt from createdOn', () => {
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to fluent-commerce', () => {
    expect(result.platform).toBe('fluent-commerce')
  })

  it('passes schema validation', () => {
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('transformProduct — fluent-commerce INACTIVE and no prices', () => {
  const raw: RawFluentCommerceProduct = {
    ref: 'SKU-OLD',
    name: 'Old Product',
    status: 'INACTIVE',
  }
  const result = transformProduct(raw)

  it('maps isActive: false when status is INACTIVE', () => {
    expect(result.isActive).toBe(false)
  })

  it('leaves retailPrice undefined when no prices', () => {
    expect(result.retailPrice).toBeUndefined()
  })

  it('passes schema validation', () => {
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('transformProduct — fluent-commerce isActive attribute overrides status', () => {
  const raw: RawFluentCommerceProduct = {
    ref: 'SKU-ATTR',
    name: 'Attr Product',
    status: 'INACTIVE',
    attributes: [{ name: 'isActive', value: 'true' }],
  }
  const result = transformProduct(raw)

  it('uses isActive attribute value over status field', () => {
    expect(result.isActive).toBe(true)
  })
})
