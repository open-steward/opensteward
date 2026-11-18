import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformProductVariant,
  untransformProduct,
  untransformProductVariant,
  type RawVtexProduct,
  type RawVtexSku,
} from '../../../../../../../src/verticals/ecommerce/adapters/vtex/transform/product'
import {
  ProductSchema,
  ProductVariantSchema,
} from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawVtexProduct> = {}): RawVtexProduct {
  return {
    Id: 987,
    Name: 'Widget Azul',
    LinkId: 'widget-azul',
    RefId: 'WID-001',
    IsActive: true,
    Description: '<p>Um widget azul.</p>',
    BrandName: 'Acme',
    ...overrides,
  }
}

function makeSku(overrides: Partial<RawVtexSku> = {}): RawVtexSku {
  return {
    Id: 501,
    ProductId: 987,
    NameComplete: 'Widget Azul P',
    IsActive: true,
    Price: 109.9,
    ListPrice: 129.9,
    WeightKg: 0.5,
    RealWeightKg: 0.48,
    IsTransported: true,
    Images: [
      {
        ImageId: 1,
        ImageUrl: 'https://cdn.vtex.com/img/widget-azul.jpg',
        ImageText: 'Widget Azul frente',
        IsMain: true,
      },
    ],
    AlternateIds: { Ean: '7898000000001' },
    ...overrides,
  }
}

describe('transformProductVariant', () => {
  it('converts decimal major unit price to integer minor units', () => {
    const result = transformProductVariant(makeSku(), '987', 'BRL')
    // 109.90 → 10990 centavos
    expect(result.price).toEqual({ amount: 10990, currency: 'BRL' })
  })

  it('sets compareAtPrice when listPrice differs from price', () => {
    const result = transformProductVariant(makeSku(), '987', 'BRL')
    // 129.90 → 12990
    expect(result.compareAtPrice).toEqual({ amount: 12990, currency: 'BRL' })
  })

  it('omits compareAtPrice when listPrice equals price', () => {
    const result = transformProductVariant(
      makeSku({ Price: 109.9, ListPrice: 109.9 }),
      '987',
      'BRL',
    )
    expect(result.compareAtPrice).toBeUndefined()
  })

  it('maps id, productId, sku from EAN, weight, weightUnit', () => {
    const result = transformProductVariant(makeSku(), '987', 'BRL')
    expect(result.id).toBe('501')
    expect(result.productId).toBe('987')
    expect(result.sku).toBe('7898000000001')
    expect(result.weight).toBe(0.48)
    expect(result.weightUnit).toBe('kg')
    expect(result.inventoryItemId).toBe('501')
    expect(result.requiresShipping).toBe(true)
  })

  it('defaults currency to BRL', () => {
    const result = transformProductVariant(makeSku(), '987')
    expect(result.price.currency).toBe('BRL')
  })

  it('maps images into metadata', () => {
    const result = transformProductVariant(makeSku(), '987', 'BRL')
    const images = (result.metadata as Record<string, unknown>)['images'] as unknown[]
    expect(Array.isArray(images)).toBe(true)
    expect(images).toHaveLength(1)
    expect((images[0] as Record<string, unknown>)['url']).toBe(
      'https://cdn.vtex.com/img/widget-azul.jpg',
    )
  })

  it('produces a payload that satisfies ProductVariantSchema', () => {
    const result = transformProductVariant(makeSku(), '987', 'BRL')
    expect(() => ProductVariantSchema.parse(result)).not.toThrow()
  })
})

describe('transformProduct', () => {
  it('maps core product fields and stringifies Id', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('987')
    expect(result.title).toBe('Widget Azul')
    expect(result.description).toBe('<p>Um widget azul.</p>')
    expect(result.handle).toBe('widget-azul')
    expect(result.status).toBe('ACTIVE')
    expect(result.vendor).toBe('Acme')
  })

  it('maps ARCHIVED status for inactive product', () => {
    const result = transformProduct(makeProduct({ IsActive: false }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('builds variants from provided SKUs', () => {
    const result = transformProduct(makeProduct(), [makeSku()], 'BRL')
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.id).toBe('501')
  })

  it('deduplicates images across SKUs', () => {
    const sku1 = makeSku({ Id: 501, Images: [{ ImageUrl: 'https://cdn.vtex.com/img/a.jpg' }] })
    const sku2 = makeSku({ Id: 502, Images: [{ ImageUrl: 'https://cdn.vtex.com/img/a.jpg' }] })
    const result = transformProduct(makeProduct(), [sku1, sku2], 'BRL')
    expect(result.images).toHaveLength(1)
  })

  it('returns undefined variants and images when no SKUs provided', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toBeUndefined()
    expect(result.images).toBeUndefined()
  })

  it('preserves raw product in metadata', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies ProductSchema', () => {
    const result = transformProduct(makeProduct(), [makeSku()], 'BRL')
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('untransformProduct', () => {
  it('round-trips core writable fields', () => {
    const canonical = transformProduct(makeProduct())
    const raw = untransformProduct(canonical)
    expect(raw['Name']).toBe('Widget Azul')
    expect(raw['Description']).toBe('<p>Um widget azul.</p>')
    expect(raw['LinkId']).toBe('widget-azul')
    expect(raw['IsActive']).toBe(true)
    expect(raw['BrandName']).toBe('Acme')
  })

  it('maps ARCHIVED status to IsActive: false', () => {
    const raw = untransformProduct({ status: 'ARCHIVED' })
    expect(raw['IsActive']).toBe(false)
  })

  it('maps ACTIVE status to IsActive: true', () => {
    const raw = untransformProduct({ status: 'ACTIVE' })
    expect(raw['IsActive']).toBe(true)
  })
})

describe('untransformProductVariant', () => {
  it('round-trips writable variant fields', () => {
    const canonical = transformProductVariant(makeSku(), '987', 'BRL')
    const raw = untransformProductVariant(canonical)
    expect(raw['ProductId']).toBe('987')
    expect(raw['NameComplete']).toBe('Widget Azul P')
    expect(raw['WeightKg']).toBe(0.48)
    expect(raw['IsActive']).toBe(true)
  })
})
