/**
 * Fixture shape verified against `gofynd/fdk-client-javascript` @ commit
 * `7598488bf04e7a75bc44088441745538d524abec`,
 * `sdk/platform/Catalog/CatalogPlatformModel.js` — `ProductSchemaV2()`.
 */
import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  type RawFyndProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/fynd/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawFyndProduct> = {}): RawFyndProduct {
  return {
    uid: 500,
    slug: 'classic-shirt',
    name: 'Classic Shirt',
    description: '<p>A timeless shirt.</p>',
    brand: { name: 'Acme Apparel' },
    is_active: true,
    tags: ['shirt', 'classic'],
    media: [{ type: 'image', url: 'https://cdn.example.com/shirt.jpg', alt: 'Classic Shirt' }],
    modified_on: '2026-03-10T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformProduct', () => {
  it('maps core fields and stringifies uid as id', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('500')
    expect(typeof result.id).toBe('string')
    expect(result.title).toBe('Classic Shirt')
    expect(result.handle).toBe('classic-shirt')
    expect(result.description).toBe('<p>A timeless shirt.</p>')
    expect(result.vendor).toBe('Acme Apparel')
    expect(result.status).toBe('ACTIVE')
  })

  it('maps is_active: false to ARCHIVED', () => {
    expect(transformProduct(makeProduct({ is_active: false })).status).toBe('ARCHIVED')
  })

  it('maps images from media', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://cdn.example.com/shirt.jpg')
    expect(result.images![0]!.alt).toBe('Classic Shirt')
  })

  it('throws when uid is missing', () => {
    expect(() => transformProduct({ ...makeProduct(), uid: undefined as unknown as number })).toThrow(
      /uid/,
    )
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies ProductSchema', () => {
    const result = transformProduct(makeProduct())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('round-trips the mutable fields via untransformProduct', () => {
    const canonical = transformProduct(makeProduct())
    const body = untransformProduct(canonical)
    expect(body.name).toBe('Classic Shirt')
    expect(body.is_active).toBe(true)
    expect(body.tags).toEqual(['shirt', 'classic'])
  })
})

describe('transformProduct (fynd): no invented title', () => {
  it('throws rather than giving a product with no name an empty title', () => {
    expect(() => transformProduct({ ...makeProduct(), name: undefined as unknown as string })).toThrow(/no name/)
  })
})
