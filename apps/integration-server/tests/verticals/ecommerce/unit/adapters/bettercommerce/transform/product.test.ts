import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
  untransformProduct,
  untransformVariant,
  type RawBCProduct,
  type RawBCVariantProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/bettercommerce/transform/product'
import {
  ProductSchema,
  ProductVariantSchema,
} from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeVariantProduct(overrides: Partial<RawBCVariantProduct> = {}): RawBCVariantProduct {
  return {
    recordId: 'var-001',
    stockCode: 'SHOE-BLK-42',
    name: 'Running Shoe - Black EU42',
    price: 59.99,
    listPrice: 79.99,
    currentStock: 10,
    weight: 0.4,
    weightUnit: 'kg',
    attributes: [
      { fieldName: 'Color', fieldValue: 'Black' },
      { fieldName: 'Size', fieldValue: '42' },
    ],
    ...overrides,
  }
}

function makeProduct(overrides: Partial<RawBCProduct> = {}): RawBCProduct {
  return {
    recordId: 'prod-001',
    name: 'Running Shoe',
    description: '<p>Great for running.</p>',
    slug: 'running-shoe',
    brand: 'SpeedBrand',
    classification: 'Footwear',
    price: 59.99,
    listPrice: 79.99,
    sellableType: 'active',
    images: [{ url: 'https://cdn.example.com/shoe.jpg', alt: 'Running Shoe', displayOrder: 0 }],
    variantProducts: [makeVariantProduct()],
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-06-01T00:00:00Z',
    publishedAt: '2024-03-15T00:00:00Z',
    ...overrides,
  }
}

describe('transformVariant (BetterCommerce)', () => {
  it('maps recordId to id', () => {
    const result = transformVariant(makeVariantProduct({ recordId: 'var-001' }), 'prod-001')
    expect(result.id).toBe('var-001')
  })

  it('maps parentId to productId', () => {
    const result = transformVariant(makeVariantProduct(), 'prod-001')
    expect(result.productId).toBe('prod-001')
  })

  it('maps stockCode to sku', () => {
    const result = transformVariant(makeVariantProduct())
    expect(result.sku).toBe('SHOE-BLK-42')
  })

  it('converts price to minor units (GBP default)', () => {
    const result = transformVariant(makeVariantProduct({ price: 59.99 }), undefined, 'GBP')
    expect(result.price.amount).toBe(5999)
    expect(result.price.currency).toBe('GBP')
  })

  it('maps compareAtPrice from listPrice when different from price', () => {
    const result = transformVariant(
      makeVariantProduct({ price: 59.99, listPrice: 79.99 }),
      undefined,
      'GBP',
    )
    expect(result.compareAtPrice?.amount).toBe(7999)
  })

  it('omits compareAtPrice when listPrice equals price', () => {
    const result = transformVariant(
      makeVariantProduct({ price: 59.99, listPrice: 59.99 }),
      undefined,
      'GBP',
    )
    expect(result.compareAtPrice).toBeUndefined()
  })

  it('maps attributes to optionValues', () => {
    const result = transformVariant(makeVariantProduct())
    expect(result.optionValues).toEqual({ Color: 'Black', Size: '42' })
  })

  it('maps weight and weightUnit', () => {
    const result = transformVariant(makeVariantProduct({ weight: 0.4, weightUnit: 'kg' }))
    expect(result.weight).toBe(0.4)
    expect(result.weightUnit).toBe('kg')
  })

  it('produces a payload satisfying ProductVariantSchema', () => {
    const result = transformVariant(makeVariantProduct(), 'prod-001', 'GBP')
    expect(() => ProductVariantSchema.parse(result)).not.toThrow()
  })
})

describe('transformProduct (BetterCommerce)', () => {
  it('maps recordId to id', () => {
    const result = transformProduct(makeProduct({ recordId: 'prod-001' }))
    expect(result.id).toBe('prod-001')
  })

  it('falls back to productId', () => {
    const result = transformProduct(makeProduct({ recordId: undefined, productId: 'prod-abc' }))
    expect(result.id).toBe('prod-abc')
  })

  it('maps name to title', () => {
    const result = transformProduct(makeProduct())
    expect(result.title).toBe('Running Shoe')
  })

  it('maps slug to handle', () => {
    const result = transformProduct(makeProduct())
    expect(result.handle).toBe('running-shoe')
  })

  it('maps sellableType=active to ACTIVE', () => {
    const result = transformProduct(makeProduct({ sellableType: 'active' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps sellableType=inactive to ARCHIVED', () => {
    const result = transformProduct(makeProduct({ sellableType: 'inactive' }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps sellableType=draft to DRAFT', () => {
    const result = transformProduct(makeProduct({ sellableType: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps description', () => {
    const result = transformProduct(makeProduct())
    expect(result.description).toBe('<p>Great for running.</p>')
  })

  it('maps brand to vendor', () => {
    const result = transformProduct(makeProduct())
    expect(result.vendor).toBe('SpeedBrand')
  })

  it('maps classification to productType', () => {
    const result = transformProduct(makeProduct())
    expect(result.productType).toBe('Footwear')
  })

  it('maps variantProducts to variants', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.id).toBe('var-001')
  })

  it('synthesises a default variant when no variantProducts', () => {
    const result = transformProduct(makeProduct({ variantProducts: [] }))
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.id).toBe('prod-001')
  })

  it('maps images', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://cdn.example.com/shoe.jpg')
    expect(result.images![0]!.alt).toBe('Running Shoe')
  })

  it('maps publishedAt', () => {
    const result = transformProduct(makeProduct())
    expect(result.publishedAt).toBe('2024-03-15T00:00:00Z')
  })

  it('stores raw in metadata', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying ProductSchema', () => {
    const result = transformProduct(makeProduct())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('untransformProduct (BetterCommerce)', () => {
  it('maps title to name', () => {
    const body = untransformProduct({ title: 'New Shoe' })
    expect(body.name).toBe('New Shoe')
  })

  it('maps vendor to brand', () => {
    const body = untransformProduct({ vendor: 'SpeedBrand' })
    expect(body.brand).toBe('SpeedBrand')
  })

  it('converts variant price from minor to major units', () => {
    const body = untransformProduct({
      variants: [{ id: 'v1', price: { amount: 5999, currency: 'GBP' }, metadata: {} }],
    })
    expect(body.price).toBe(59.99)
  })
})

describe('untransformVariant (BetterCommerce)', () => {
  it('maps sku to stockCode', () => {
    const body = untransformVariant({ sku: 'SKU-001' })
    expect(body.stockCode).toBe('SKU-001')
  })

  it('converts price from minor to major units', () => {
    const body = untransformVariant({ price: { amount: 5999, currency: 'GBP' } })
    expect(body.price).toBe(59.99)
  })

  it('maps title to name', () => {
    const body = untransformVariant({ title: 'Size 42' })
    expect(body.name).toBe('Size 42')
  })
})
