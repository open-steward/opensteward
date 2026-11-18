import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  type RawBigCartelProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/bigcartel/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(
  overrides: Partial<RawBigCartelProduct> = {},
): RawBigCartelProduct {
  return {
    id: '12345',
    type: 'products',
    attributes: {
      name: 'Handmade Candle',
      description: '<p>A beautifully crafted soy candle.</p>',
      permalink: 'handmade-candle',
      status: 'active',
      default_price: '24.99',
      created_at: '2024-03-15T10:00:00Z',
      updated_at: '2024-04-01T14:30:00Z',
      images: [
        { url: 'https://images.bigcartel.com/candle-front.jpg', width: 800, height: 600 },
        { url: 'https://images.bigcartel.com/candle-side.jpg', width: 800, height: 600 },
      ],
      options: [
        { name: 'Scent', values: ['Lavender', 'Vanilla', 'Cedar'] },
        { name: 'Size', values: ['Small', 'Large'] },
      ],
    },
    relationships: {
      categories: {
        data: [{ id: 'cat-1', type: 'categories' }],
      },
    },
    ...overrides,
  }
}

describe('transformProduct (Big Cartel)', () => {
  it('maps core fields and stringifies ids', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.id).toBe('12345')
    expect(typeof result.id).toBe('string')
    expect(result.title).toBe('Handmade Candle')
    expect(result.handle).toBe('handmade-candle')
    expect(result.description).toBe('<p>A beautifully crafted soy candle.</p>')
    expect(result.status).toBe('ACTIVE')
  })

  it('maps images with position', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(2)
    expect(result.images![0]).toMatchObject({
      url: 'https://images.bigcartel.com/candle-front.jpg',
      width: 800,
      height: 600,
      position: 0,
    })
    expect(result.images![1]!.position).toBe(1)
  })

  it('maps options with values', () => {
    const result = transformProduct(makeProduct())
    expect(result.options).toHaveLength(2)
    expect(result.options![0]).toMatchObject({
      name: 'Scent',
      values: ['Lavender', 'Vanilla', 'Cedar'],
      position: 0,
    })
  })

  it('synthesises a default variant from product price', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('12345:default')
    expect(v.productId).toBe('12345')
    expect(v.price).toEqual({ amount: 2499, currency: 'USD' })
    expect((v.metadata as { synthetic?: boolean }).synthetic).toBe(true)
  })

  it('maps category IDs to tags', () => {
    const result = transformProduct(makeProduct())
    expect(result.tags).toEqual(['cat-1'])
  })

  it('maps timestamps', () => {
    const result = transformProduct(makeProduct())
    expect(result.createdAt).toBe('2024-03-15T10:00:00Z')
    expect(result.updatedAt).toBe('2024-04-01T14:30:00Z')
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

  it('maps hidden status to DRAFT', () => {
    const raw = makeProduct({
      attributes: {
        ...makeProduct().attributes,
        status: 'hidden',
      },
    })
    const result = transformProduct(raw)
    expect(result.status).toBe('DRAFT')
  })

  it('maps sold_out status to ARCHIVED', () => {
    const raw = makeProduct({
      attributes: {
        ...makeProduct().attributes,
        status: 'sold_out',
      },
    })
    const result = transformProduct(raw)
    expect(result.status).toBe('ARCHIVED')
  })

  it('handles product with no images or options', () => {
    const raw = makeProduct({
      attributes: {
        name: 'Simple Item',
        default_price: '10.00',
        images: [],
        options: [],
      },
      relationships: undefined,
    })
    const result = transformProduct(raw)
    expect(result.images).toBeUndefined()
    expect(result.options).toBeUndefined()
    expect(result.tags).toBeUndefined()
    expect(result.variants).toHaveLength(1)
  })

  it('handles zero price', () => {
    const raw = makeProduct({
      attributes: {
        ...makeProduct().attributes,
        default_price: '0',
      },
    })
    const result = transformProduct(raw)
    expect(result.variants![0]!.price).toEqual({ amount: 0, currency: 'USD' })
  })
})

describe('untransformProduct (Big Cartel)', () => {
  it('round-trips writable fields', () => {
    const canonical = transformProduct(makeProduct())
    const body = untransformProduct(canonical) as {
      data: { type: string; attributes: Record<string, unknown> }
    }
    expect(body.data.type).toBe('products')
    expect(body.data.attributes['name']).toBe('Handmade Candle')
    expect(body.data.attributes['description']).toBe(
      '<p>A beautifully crafted soy candle.</p>',
    )
    expect(body.data.attributes['permalink']).toBe('handmade-candle')
    expect(body.data.attributes['status']).toBe('active')
  })

  it('includes price from variant', () => {
    const canonical = transformProduct(makeProduct())
    const body = untransformProduct(canonical) as {
      data: { attributes: Record<string, unknown> }
    }
    expect(body.data.attributes['default_price']).toBe('24.99')
  })
})
