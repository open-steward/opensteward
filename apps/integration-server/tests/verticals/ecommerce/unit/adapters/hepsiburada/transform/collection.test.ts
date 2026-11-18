import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawWooCommerceCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/hepsiburada/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeRaw(overrides: Partial<RawWooCommerceCategory> = {}): RawWooCommerceCategory {
  return {
    id: 10,
    name: 'Elektronik',
    slug: 'elektronik',
    parent: 0,
    description: 'Elektronik ürünleri',
    display: 'default',
    image: {
      id: '20',
      src: 'https://cdn.hepsiburada.com/elektronik.jpg',
      name: 'Elektronik',
      alt: 'Elektronik kategori',
    },
    menu_order: 1,
    count: 50,
    ...overrides,
  }
}

describe('transformCollection (hepsiburada / WooCommerce)', () => {
  it('maps id and title from name', () => {
    const result = transformCollection(makeRaw())
    expect(result.id).toBe('10')
    expect(result.title).toBe('Elektronik')
  })

  it('maps handle from slug', () => {
    const result = transformCollection(makeRaw())
    expect(result.handle).toBe('elektronik')
  })

  it('maps description', () => {
    const result = transformCollection(makeRaw())
    expect(result.description).toBe('Elektronik ürünleri')
  })

  it('hardcodes type to MANUAL (WooCommerce has no smart collections)', () => {
    const result = transformCollection(makeRaw())
    expect(result.type).toBe('MANUAL')
  })

  it('maps image with id, url, and alt', () => {
    const result = transformCollection(makeRaw())
    expect(result.image).toMatchObject({
      id: '20',
      url: 'https://cdn.hepsiburada.com/elektronik.jpg',
      alt: 'Elektronik kategori',
    })
  })

  it('sets productIds to empty array (WC categories have no inline members)', () => {
    const result = transformCollection(makeRaw())
    expect(result.productIds).toEqual([])
  })

  it('returns undefined image when image src is missing', () => {
    const result = transformCollection(makeRaw({ image: { src: undefined, id: 5 } }))
    expect(result.image).toBeUndefined()
  })

  it('produces a payload that satisfies CollectionSchema', () => {
    expect(() => CollectionSchema.parse(transformCollection(makeRaw()))).not.toThrow()
  })

  it('round-trips via untransformCollection', () => {
    const body = untransformCollection(transformCollection(makeRaw()))
    expect(body['name']).toBe('Elektronik')
    expect(body['slug']).toBe('elektronik')
    expect(body['description']).toBe('Elektronik ürünleri')
  })
})
