import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawZidCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/zid/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(overrides: Partial<RawZidCategory> = {}): RawZidCategory {
  return {
    id: 42,
    uuid: 'uuid-cat-42',
    name: 'Summer Collection',
    slug: 'summer-collection',
    description: 'Hot summer picks',
    image: 'https://cdn.zid.store/category/summer.jpg',
    image_full_size: 'https://cdn.zid.store/category/summer-full.jpg',
    img_alt_text: 'Summer banner',
    is_published: true,
    products_count: 5,
    ...overrides,
  }
}

describe('transformCollection (Zid)', () => {
  it('maps numeric id to string', () => {
    const result = transformCollection(makeCategory({ id: 99 }))
    expect(result.id).toBe('99')
  })

  it('prefers image_full_size over image', () => {
    const result = transformCollection(makeCategory())
    expect(result.image?.url).toBe('https://cdn.zid.store/category/summer-full.jpg')
  })

  it('falls back to image when image_full_size is absent', () => {
    const result = transformCollection(makeCategory({ image_full_size: undefined }))
    expect(result.image?.url).toBe('https://cdn.zid.store/category/summer.jpg')
  })

  it('maps img_alt_text to image.alt', () => {
    const result = transformCollection(makeCategory())
    expect(result.image?.alt).toBe('Summer banner')
  })

  it('maps slug to handle', () => {
    const result = transformCollection(makeCategory())
    expect(result.handle).toBe('summer-collection')
  })

  it('maps description', () => {
    const result = transformCollection(makeCategory())
    expect(result.description).toBe('Hot summer picks')
  })

  it('hardcodes type as MANUAL', () => {
    const result = transformCollection(makeCategory())
    expect(result.type).toBe('MANUAL')
  })

  it('maps localised name object preferring English', () => {
    const result = transformCollection(makeCategory({ name: { en: 'Summer', ar: 'صيف' } }))
    expect(result.title).toBe('Summer')
  })

  it('falls back to Arabic when English is absent', () => {
    const result = transformCollection(makeCategory({ name: { en: null, ar: 'صيف' } }))
    expect(result.title).toBe('صيف')
  })

  it('falls back to string id when name is absent', () => {
    const result = transformCollection(makeCategory({ name: undefined, names: undefined }))
    expect(result.title).toBe('42')
  })

  it('returns undefined image when image fields are null', () => {
    const result = transformCollection(makeCategory({ image: null, image_full_size: null }))
    expect(result.image).toBeUndefined()
  })

  it('stores raw in metadata', () => {
    const raw = makeCategory()
    const result = transformCollection(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying CollectionSchema', () => {
    const result = transformCollection(makeCategory())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })
})

describe('untransformCollection (Zid)', () => {
  it('maps title to localised name object', () => {
    const body = untransformCollection({ title: 'Summer' })
    expect((body.name as Record<string, string>).en).toBe('Summer')
    expect((body.name as Record<string, string>).ar).toBe('Summer')
  })

  it('maps handle to slug', () => {
    const body = untransformCollection({ handle: 'summer-sale' })
    expect(body.slug).toBe('summer-sale')
  })

  it('maps description', () => {
    const body = untransformCollection({ description: 'A great collection' })
    expect(body.description).toBe('A great collection')
  })
})
