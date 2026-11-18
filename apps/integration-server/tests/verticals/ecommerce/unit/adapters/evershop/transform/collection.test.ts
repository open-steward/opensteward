import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawEverShopCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/evershop/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(overrides: Partial<RawEverShopCategory> = {}): RawEverShopCategory {
  return {
    category_id: 7,
    uuid: 'cat-uuid-evershop-1',
    name: 'Footwear',
    url_key: 'footwear',
    description: '<p>All footwear products</p>',
    image: 'https://example.com/footwear.jpg',
    status: 1,
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformCollection (EverShop)', () => {
  it('uses uuid as id when available', () => {
    const result = transformCollection(makeCategory({ uuid: 'cat-uuid-evershop-1' }))
    expect(result.id).toBe('cat-uuid-evershop-1')
  })

  it('falls back to string category_id when uuid is absent', () => {
    const result = transformCollection(makeCategory({ uuid: undefined }))
    expect(result.id).toBe('7')
  })

  it('maps name to title', () => {
    const result = transformCollection(makeCategory())
    expect(result.title).toBe('Footwear')
  })

  it('maps url_key to handle', () => {
    const result = transformCollection(makeCategory())
    expect(result.handle).toBe('footwear')
  })

  it('maps description', () => {
    const result = transformCollection(makeCategory())
    expect(result.description).toBe('<p>All footwear products</p>')
  })

  it('always sets type to MANUAL', () => {
    const result = transformCollection(makeCategory())
    expect(result.type).toBe('MANUAL')
  })

  it('builds image url from absolute https path', () => {
    const result = transformCollection(makeCategory({ image: 'https://example.com/footwear.jpg' }))
    expect(result.image).toBeDefined()
    expect(result.image!.url).toBe('https://example.com/footwear.jpg')
  })

  it('prepends slash for relative paths', () => {
    const result = transformCollection(makeCategory({ image: 'uploads/footwear.jpg' }))
    expect(result.image!.url).toBe('/uploads/footwear.jpg')
  })

  it('keeps absolute-path images starting with /', () => {
    const result = transformCollection(makeCategory({ image: '/media/footwear.jpg' }))
    expect(result.image!.url).toBe('/media/footwear.jpg')
  })

  it('returns undefined image when image is null', () => {
    const result = transformCollection(makeCategory({ image: null }))
    expect(result.image).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCategory()
    const result = transformCollection(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying CollectionSchema', () => {
    const result = transformCollection(makeCategory())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })
})

describe('untransformCollection (EverShop)', () => {
  it('maps title to name', () => {
    const body = untransformCollection({ title: 'Bags' })
    expect(body['name']).toBe('Bags')
  })

  it('maps handle to url_key', () => {
    const body = untransformCollection({ handle: 'bags' })
    expect(body['url_key']).toBe('bags')
  })

  it('maps image url to image field', () => {
    const body = untransformCollection({ image: { url: '/media/bags.jpg' } })
    expect(body['image']).toBe('/media/bags.jpg')
  })
})
