import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformProductVariant,
  untransformProduct,
  untransformProductVariant,
  type RawCLSku,
} from '../../../../../../../src/verticals/ecommerce/adapters/commercelayer/transform/product'
import { ProductSchema, ProductVariantSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeSku(overrides: Partial<RawCLSku> = {}): RawCLSku {
  return {
    id: 'sku-abc123',
    code: 'tshirt-blu-m',
    name: 'Blue T-Shirt Medium',
    description: '<p>A comfortable blue t-shirt in medium.</p>',
    image_url: 'https://cdn.commercelayer.io/images/tshirt-blue.jpg',
    weight: 200,
    unit_of_weight: 'g',
    pieces_per_pack: 1,
    do_not_ship: false,
    do_not_track: false,
    created_at: '2024-06-01T10:00:00.000Z',
    updated_at: '2024-06-15T14:30:00.000Z',
    _type: 'skus',
    ...overrides,
  }
}

describe('transformProduct (Commerce Layer)', () => {
  it('maps core fields from SKU', () => {
    const result = transformProduct(makeSku())
    expect(result.id).toBe('sku-abc123')
    expect(result.title).toBe('Blue T-Shirt Medium')
    expect(result.description).toBe('<p>A comfortable blue t-shirt in medium.</p>')
    expect(result.handle).toBe('tshirt-blu-m')
    expect(result.status).toBe('ACTIVE')
  })

  it('synthesizes a default variant', () => {
    const result = transformProduct(makeSku())
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('sku-abc123:default')
    expect(v.productId).toBe('sku-abc123')
    expect(v.sku).toBe('tshirt-blu-m')
    expect(v.weight).toBe(200)
    expect(v.weightUnit).toBe('g')
  })

  it('maps images from image_url', () => {
    const result = transformProduct(makeSku())
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://cdn.commercelayer.io/images/tshirt-blue.jpg')
  })

  it('returns undefined images when no image_url', () => {
    const result = transformProduct(makeSku({ image_url: undefined }))
    expect(result.images).toBeUndefined()
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeSku()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
  })

  it('handles missing name gracefully', () => {
    const result = transformProduct(makeSku({ name: undefined }))
    expect(result.title).toBe('')
  })

  it('maps timestamps', () => {
    const result = transformProduct(makeSku())
    expect(result.createdAt).toBe('2024-06-01T10:00:00.000Z')
    expect(result.updatedAt).toBe('2024-06-15T14:30:00.000Z')
  })

  it('produces a payload that satisfies ProductSchema', () => {
    const result = transformProduct(makeSku())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('transformProductVariant (Commerce Layer)', () => {
  it('builds a canonical variant from a SKU', () => {
    const v = transformProductVariant(makeSku())
    expect(v.id).toBe('sku-abc123:default')
    expect(v.productId).toBe('sku-abc123')
    expect(v.sku).toBe('tshirt-blu-m')
    expect(v.price).toEqual({ amount: 0, currency: 'USD' })
    expect(v.requiresShipping).toBe(true)
    expect(v.taxable).toBe(true)
  })

  it('sets requiresShipping=false when do_not_ship=true', () => {
    const v = transformProductVariant(makeSku({ do_not_ship: true }))
    expect(v.requiresShipping).toBe(false)
  })

  it('maps weight units', () => {
    expect(transformProductVariant(makeSku({ unit_of_weight: 'kg' })).weightUnit).toBe('kg')
    expect(transformProductVariant(makeSku({ unit_of_weight: 'oz' })).weightUnit).toBe('oz')
    expect(transformProductVariant(makeSku({ unit_of_weight: 'lb' })).weightUnit).toBe('lb')
    expect(transformProductVariant(makeSku({ unit_of_weight: 'lbs' })).weightUnit).toBe('lb')
    expect(transformProductVariant(makeSku({ unit_of_weight: undefined })).weightUnit).toBeUndefined()
  })

  it('produces a payload that satisfies ProductVariantSchema', () => {
    const v = transformProductVariant(makeSku())
    expect(() => ProductVariantSchema.parse(v)).not.toThrow()
  })
})

describe('untransformProduct (Commerce Layer)', () => {
  it('produces JSON:API body', () => {
    const body = untransformProduct({
      title: 'Red Hat',
      handle: 'RED-HAT-01',
      description: 'A red hat',
    }) as { data: { type: string; attributes: Record<string, unknown> } }
    expect(body.data.type).toBe('skus')
    expect(body.data.attributes['name']).toBe('Red Hat')
    expect(body.data.attributes['code']).toBe('RED-HAT-01')
    expect(body.data.attributes['description']).toBe('A red hat')
  })

  it('uses first variant sku as code', () => {
    const body = untransformProduct({
      title: 'Test',
      variants: [{ id: 'v1', sku: 'SKU-FROM-VARIANT', price: { amount: 10, currency: 'USD' }, metadata: {} }],
    }) as { data: { type: string; attributes: Record<string, unknown> } }
    expect(body.data.attributes['code']).toBe('SKU-FROM-VARIANT')
  })
})

describe('untransformProductVariant (Commerce Layer)', () => {
  it('produces JSON:API body for variant', () => {
    const body = untransformProductVariant({
      sku: 'VAR-001',
      title: 'Variant One',
      weight: 500,
      weightUnit: 'g',
    }) as { data: { type: string; attributes: Record<string, unknown> } }
    expect(body.data.type).toBe('skus')
    expect(body.data.attributes['code']).toBe('VAR-001')
    expect(body.data.attributes['name']).toBe('Variant One')
    expect(body.data.attributes['weight']).toBe(500)
  })
})
