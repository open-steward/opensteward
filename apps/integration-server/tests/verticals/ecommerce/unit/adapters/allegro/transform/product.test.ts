import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  mapStatus,
  type RawAllegroOffer,
} from '../../../../../../../src/verticals/ecommerce/adapters/allegro/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeOffer(overrides: Partial<RawAllegroOffer> = {}): RawAllegroOffer {
  return {
    id: '12345678',
    name: 'Polska Drewniana Szkatulka',
    description: {
      sections: [
        {
          items: [
            { type: 'TEXT', content: '<p>Handcrafted wooden jewelry box.</p>' },
          ],
        },
      ],
    },
    category: { id: '261395' },
    parameters: [
      { id: '1', name: 'Marka', values: [{ value: 'PolskiWyrob' }] },
      { id: '2', name: 'Kolor', values: [{ value: 'Brazowy' }] },
    ],
    images: [
      { url: 'https://a.allegroimg.com/s720/aaa.jpg' },
      { url: 'https://a.allegroimg.com/s720/bbb.jpg' },
    ],
    sellingMode: {
      format: 'BUY_NOW',
      price: { amount: '49.99', currency: 'PLN' },
    },
    stock: { available: 25, sold: 10 },
    publication: {
      status: 'ACTIVE',
      startingAt: '2024-01-15T10:00:00Z',
    },
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-06-01T14:30:00Z',
    ...overrides,
  }
}

describe('transformProduct (Allegro)', () => {
  it('uses the offer id as the canonical id', () => {
    const result = transformProduct(makeOffer())
    expect(result.id).toBe('12345678')
    expect(result.title).toBe('Polska Drewniana Szkatulka')
  })

  it('extracts brand from parameters as vendor', () => {
    const result = transformProduct(makeOffer())
    expect(result.vendor).toBe('PolskiWyrob')
  })

  it('maps category id to productType', () => {
    const result = transformProduct(makeOffer())
    expect(result.productType).toBe('261395')
  })

  it('maps publication status to canonical ProductStatus', () => {
    expect(mapStatus('ACTIVE')).toBe('ACTIVE')
    expect(mapStatus('ACTIVATING')).toBe('DRAFT')
    expect(mapStatus('INACTIVE')).toBe('ARCHIVED')
    expect(mapStatus('ENDED')).toBe('ARCHIVED')
    expect(mapStatus(undefined)).toBeUndefined()
    expect(mapStatus('UNKNOWN_VALUE')).toBeUndefined()
  })

  it('extracts ACTIVE status from publication field', () => {
    const result = transformProduct(makeOffer())
    expect(result.status).toBe('ACTIVE')
  })

  it('extracts description from structured sections', () => {
    const result = transformProduct(makeOffer())
    expect(result.description).toBe('<p>Handcrafted wooden jewelry box.</p>')
  })

  it('returns undefined description when no sections exist', () => {
    const result = transformProduct(makeOffer({ description: undefined }))
    expect(result.description).toBeUndefined()
  })

  it('extracts images with positions', () => {
    const result = transformProduct(makeOffer())
    expect(result.images).toHaveLength(2)
    expect(result.images![0]).toMatchObject({
      url: 'https://a.allegroimg.com/s720/aaa.jpg',
      position: 0,
    })
    expect(result.images![1]).toMatchObject({
      url: 'https://a.allegroimg.com/s720/bbb.jpg',
      position: 1,
    })
  })

  it('returns undefined images when none exist', () => {
    const result = transformProduct(makeOffer({ images: undefined }))
    expect(result.images).toBeUndefined()
  })

  it('surfaces timestamps', () => {
    const result = transformProduct(makeOffer())
    expect(result.createdAt).toBe('2024-01-15T10:00:00Z')
    expect(result.updatedAt).toBe('2024-06-01T14:30:00Z')
  })

  it('produces a payload that satisfies ProductSchema and preserves raw in metadata', () => {
    const raw = makeOffer()
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
    expect(result.metadata['id']).toBe('12345678')
  })

  it('falls back to offer id as title when name is absent', () => {
    const result = transformProduct(makeOffer({ name: undefined }))
    expect(result.title).toBe('12345678')
  })

  it('handles offer with no brand parameter', () => {
    const result = transformProduct(makeOffer({ parameters: undefined }))
    expect(result.vendor).toBeUndefined()
  })
})

describe('untransformProduct (Allegro)', () => {
  it('maps title to name', () => {
    const body = untransformProduct({ title: 'Test Product' } as Partial<import('../../../../../../../src/verticals/ecommerce/schema/product').Product>)
    expect(body['name']).toBe('Test Product')
  })

  it('maps description to structured sections', () => {
    const body = untransformProduct({ description: 'A description' } as Partial<import('../../../../../../../src/verticals/ecommerce/schema/product').Product>)
    const desc = body['description'] as Record<string, unknown>
    expect(desc).toBeDefined()
    const sections = desc['sections'] as Array<Record<string, unknown>>
    expect(sections).toHaveLength(1)
  })

  it('maps images to Allegro format', () => {
    const body = untransformProduct({
      images: [{ url: 'https://example.com/a.jpg', position: 0 }],
    } as Partial<import('../../../../../../../src/verticals/ecommerce/schema/product').Product>)
    const images = body['images'] as Array<Record<string, unknown>>
    expect(images).toEqual([{ url: 'https://example.com/a.jpg' }])
  })

  it('preserves metadata passthrough for sellingMode and stock', () => {
    const body = untransformProduct({
      metadata: {
        sellingMode: { format: 'BUY_NOW', price: { amount: '10', currency: 'PLN' } },
        stock: { available: 5 },
      },
    } as Partial<import('../../../../../../../src/verticals/ecommerce/schema/product').Product>)
    expect(body['sellingMode']).toBeDefined()
    expect(body['stock']).toBeDefined()
  })
})
