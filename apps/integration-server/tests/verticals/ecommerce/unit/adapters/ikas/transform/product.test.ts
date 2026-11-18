import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
  untransformProduct,
  untransformVariant,
  type RawIkasProduct,
  type RawIkasVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/ikas/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeVariant(overrides: Partial<RawIkasVariant> = {}): RawIkasVariant {
  return {
    id: 'var-001',
    sku: 'TEE-BLU-M',
    barcodeList: ['1234567890'],
    weight: 0.3,
    isActive: true,
    prices: [{ sellPrice: 99.99, discountPrice: 79.99, currency: 'TRY' }],
    stocks: [{ stockCount: 15, stockLocationId: 'loc-ist' }],
    variantValues: [
      { variantTypeName: 'Color', variantValueName: 'Blue' },
      { variantTypeName: 'Size', variantValueName: 'M' },
    ],
    ...overrides,
  }
}

function makeProduct(overrides: Partial<RawIkasProduct> = {}): RawIkasProduct {
  return {
    id: 'prod-001',
    name: 'Classic T-Shirt',
    description: 'A comfortable everyday t-shirt.',
    isActive: true,
    tags: ['summer', 'casual'],
    categories: [{ id: 'cat-1', name: 'Apparel' }],
    brand: { id: 'brand-1', name: 'BasicCo' },
    variants: [makeVariant()],
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformVariant (ikas)', () => {
  it('maps id, sku, barcode', () => {
    const result = transformVariant(makeVariant(), 'prod-001')
    expect(result.id).toBe('var-001')
    expect(result.sku).toBe('TEE-BLU-M')
    expect(result.barcode).toBe('1234567890')
  })

  it('maps price in minor units from sellPrice', () => {
    const result = transformVariant(makeVariant(), 'prod-001')
    // 99.99 TRY → 9999 minor units
    expect(result.price).toEqual({ amount: 9999, currency: 'TRY' })
  })

  it('maps compareAtPrice in minor units from discountPrice', () => {
    const result = transformVariant(makeVariant(), 'prod-001')
    // 79.99 TRY → 7999 minor units
    expect(result.compareAtPrice).toEqual({ amount: 7999, currency: 'TRY' })
  })

  it('omits compareAtPrice when discountPrice is 0', () => {
    const result = transformVariant(
      makeVariant({ prices: [{ sellPrice: 50, discountPrice: 0 }] }),
      'prod-001',
    )
    expect(result.compareAtPrice).toBeUndefined()
  })

  it('maps weight', () => {
    const result = transformVariant(makeVariant(), 'prod-001')
    expect(result.weight).toBe(0.3)
    expect(result.weightUnit).toBe('kg')
  })

  it('builds title from variantValues', () => {
    const result = transformVariant(makeVariant(), 'prod-001')
    expect(result.title).toBe('Blue / M')
  })

  it('builds optionValues record from variantValues', () => {
    const result = transformVariant(makeVariant(), 'prod-001')
    expect(result.optionValues).toEqual({ Color: 'Blue', Size: 'M' })
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeVariant()
    const result = transformVariant(raw, 'prod-001')
    expect(result.metadata).toBe(raw)
  })
})

describe('transformProduct (ikas)', () => {
  it('maps id, title, description', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('prod-001')
    expect(result.title).toBe('Classic T-Shirt')
    expect(result.description).toBe('A comfortable everyday t-shirt.')
  })

  it('maps status ACTIVE when isActive=true', () => {
    const result = transformProduct(makeProduct())
    expect(result.status).toBe('ACTIVE')
  })

  it('maps status DRAFT when isActive=false', () => {
    const result = transformProduct(makeProduct({ isActive: false }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps vendor from brand.name', () => {
    const result = transformProduct(makeProduct())
    expect(result.vendor).toBe('BasicCo')
  })

  it('maps productType from first category name', () => {
    const result = transformProduct(makeProduct())
    expect(result.productType).toBe('Apparel')
  })

  it('maps tags', () => {
    const result = transformProduct(makeProduct())
    expect(result.tags).toEqual(['summer', 'casual'])
  })

  it('derives options from variant values', () => {
    const result = transformProduct(makeProduct())
    expect(result.options).toHaveLength(2)
    const colorOpt = result.options!.find((o) => o.name === 'Color')
    expect(colorOpt?.values).toContain('Blue')
  })

  it('maps variants', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.id).toBe('var-001')
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformProduct(makeProduct())
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
    expect(result.updatedAt).toBe('2024-03-01T00:00:00Z')
  })

  it('preserves raw payload in metadata and produces a schema-valid result', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformProduct', () => {
    const canonical = transformProduct(makeProduct())
    const body = untransformProduct(canonical)
    expect(body['name']).toBe('Classic T-Shirt')
    expect(body['isActive']).toBe(true)
  })

  it('round-trips variant via untransformVariant', () => {
    const canonical = transformVariant(makeVariant(), 'prod-001')
    const body = untransformVariant(canonical)
    expect(body['sku']).toBe('TEE-BLU-M')
    expect(body['barcodeList']).toEqual(['1234567890'])
  })
})
