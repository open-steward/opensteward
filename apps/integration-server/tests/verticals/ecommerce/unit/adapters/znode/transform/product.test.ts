import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformProductVariant,
  untransformProduct,
  type RawZnodeProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/znode/transform/product'
import { ProductSchema, ProductVariantSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeConfigurable(overrides: Partial<RawZnodeProduct> = {}): RawZnodeProduct {
  return {
    ZnodeProductId: 42,
    SKU: 'PUMP-3000',
    Name: 'Industrial Pump 3000',
    IsActive: true,
    ProductType: 2, // Configurable
    Description: '<p>Heavy-duty pump for B2B applications.</p>',
    SEOUrl: 'industrial-pump-3000',
    CreatedDate: '2024-03-15T10:00:00.000Z',
    ModifiedDate: '2024-04-01T14:30:00.000Z',
    SalesPrice: 1299.99,
    CurrencyCode: 'EUR',
    Images: [
      { MediaId: 901, MediaPath: '/media/pump-front.jpg', DisplayOrder: 0, AlternateText: 'Pump front' },
      { MediaId: 902, MediaPath: '/media/pump-side.jpg', DisplayOrder: 1, AlternateText: 'Pump side' },
    ],
    Attributes: [
      { AttributeCode: 'material', AttributeName: 'Material', AttributeValues: ['Steel', 'Titanium'] },
      { AttributeCode: 'size', AttributeName: 'Size', AttributeValues: ['Small', 'Large'] },
    ],
    ...overrides,
  }
}

function makeChild(overrides: Partial<RawZnodeProduct> = {}): RawZnodeProduct {
  return {
    ZnodeProductId: 43,
    SKU: 'PUMP-3000-STEEL-SM',
    Name: 'Industrial Pump 3000 - Steel / Small',
    IsActive: true,
    ProductType: 1, // Simple
    SalesPrice: 1299.99,
    CurrencyCode: 'EUR',
    ...overrides,
  }
}

describe('transformProduct (Znode)', () => {
  it('maps core fields for a configurable parent', () => {
    const result = transformProduct(makeConfigurable())
    expect(result.id).toBe('42')
    expect(result.title).toBe('Industrial Pump 3000')
    expect(result.description).toBe('<p>Heavy-duty pump for B2B applications.</p>')
    expect(result.handle).toBe('industrial-pump-3000')
    expect(result.status).toBe('ACTIVE')
    expect(result.productType).toBe('configurable')
  })

  it('maps children into variants', () => {
    const parent = makeConfigurable()
    const child = makeChild()
    const result = transformProduct(parent, [child])
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('43')
    expect(v.productId).toBe('42')
    expect(v.sku).toBe('PUMP-3000-STEEL-SM')
    expect(v.price).toEqual({ amount: 129999, currency: 'EUR' })
  })

  it('uses AssociatedProducts when no explicit children provided', () => {
    const parent = makeConfigurable({
      AssociatedProducts: [makeChild()],
    })
    const result = transformProduct(parent)
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.id).toBe('43')
  })

  it('synthesises a default variant for simple products', () => {
    const simple = makeConfigurable({
      ZnodeProductId: 99,
      ProductType: 1,
      SKU: 'BOLT-7',
      SalesPrice: 0.50,
      CurrencyCode: 'USD',
    })
    const result = transformProduct(simple)
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('99:default')
    expect(v.sku).toBe('BOLT-7')
    expect((v.metadata as { synthetic?: boolean }).synthetic).toBe(true)
    expect(() => ProductVariantSchema.parse(v)).not.toThrow()
  })

  it('builds options from Attributes', () => {
    const result = transformProduct(makeConfigurable())
    expect(result.options).toHaveLength(2)
    expect(result.options![0]!.name).toBe('Material')
    expect(result.options![0]!.values).toEqual(['Steel', 'Titanium'])
  })

  it('maps images with correct positions', () => {
    const result = transformProduct(makeConfigurable())
    expect(result.images).toHaveLength(2)
    expect(result.images![0]!.url).toBe('/media/pump-front.jpg')
    expect(result.images![0]!.alt).toBe('Pump front')
    expect(result.images![0]!.position).toBe(0)
    expect(result.images![1]!.id).toBe('902')
  })

  it('maps ARCHIVED status for inactive products', () => {
    const result = transformProduct(makeConfigurable({ IsActive: false }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeConfigurable()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies ProductSchema', () => {
    const result = transformProduct(makeConfigurable(), [makeChild()])
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('transformProductVariant (Znode) standalone', () => {
  it('builds a canonical variant from a child product', () => {
    const v = transformProductVariant(makeChild(), '42')
    expect(v.id).toBe('43')
    expect(v.productId).toBe('42')
    expect(v.sku).toBe('PUMP-3000-STEEL-SM')
    expect(v.price).toEqual({ amount: 129999, currency: 'EUR' })
    expect(v.taxable).toBe(true)
    expect(() => ProductVariantSchema.parse(v)).not.toThrow()
  })
})

describe('untransformProduct (Znode)', () => {
  it('round-trips writable fields', () => {
    const canonical = transformProduct(makeConfigurable({ ProductType: 1 }))
    const body = untransformProduct(canonical) as Record<string, unknown>
    expect(body['Name']).toBe('Industrial Pump 3000')
    expect(body['IsActive']).toBe(true)
  })

  it('maps ARCHIVED status to IsActive=false', () => {
    const body = untransformProduct({ status: 'ARCHIVED' }) as Record<string, unknown>
    expect(body['IsActive']).toBe(false)
  })
})
