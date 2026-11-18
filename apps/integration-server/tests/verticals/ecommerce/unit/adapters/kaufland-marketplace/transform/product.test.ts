import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  type RawKauflandProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/kaufland-marketplace/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawKauflandProduct> = {}): RawKauflandProduct {
  return {
    id_product: 9001,
    eans: ['1234567890123'],
    title: 'Wireless Keyboard',
    manufacturer: 'Acme',
    main_picture: 'https://cdn.kaufland.de/img/keyboard.jpg',
    is_valid: true,
    ...overrides,
  }
}

describe('transformProduct (kaufland-marketplace)', () => {
  it('maps id_product to string id', () => {
    const result = transformProduct(makeProduct({ id_product: 42 }))
    expect(result.id).toBe('42')
  })

  it('falls back to first EAN when id_product is undefined', () => {
    const result = transformProduct(makeProduct({ id_product: undefined }))
    expect(result.id).toBe('1234567890123')
  })

  it('maps title', () => {
    const result = transformProduct(makeProduct())
    expect(result.title).toBe('Wireless Keyboard')
  })

  it('maps is_valid true to ACTIVE status', () => {
    const result = transformProduct(makeProduct({ is_valid: true }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps is_valid false to DRAFT status', () => {
    const result = transformProduct(makeProduct({ is_valid: false }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps manufacturer to vendor', () => {
    const result = transformProduct(makeProduct({ manufacturer: 'TechCorp' }))
    expect(result.vendor).toBe('TechCorp')
  })

  it('maps main_picture to images[0].url', () => {
    const result = transformProduct(makeProduct())
    expect(result.images?.[0]?.url).toBe('https://cdn.kaufland.de/img/keyboard.jpg')
  })

  it('sets images to undefined when main_picture is absent', () => {
    const result = transformProduct(makeProduct({ main_picture: undefined }))
    expect(result.images).toBeUndefined()
  })

  it('sets handle to undefined (no slugs)', () => {
    const result = transformProduct(makeProduct())
    expect(result.handle).toBeUndefined()
  })

  it('sets description to undefined', () => {
    const result = transformProduct(makeProduct())
    expect(result.description).toBeUndefined()
  })

  it('sets variants to undefined', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toBeUndefined()
  })

  it('stores raw payload in metadata', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying ProductSchema', () => {
    const result = transformProduct(makeProduct())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('untransformProduct (kaufland-marketplace)', () => {
  it('includes title in attributes when present', () => {
    const body = untransformProduct({ title: 'New Title' })
    expect((body.attributes as Record<string, unknown>).title).toBe('New Title')
  })

  it('includes manufacturer in attributes when vendor is set', () => {
    const body = untransformProduct({ vendor: 'BrandX' })
    expect((body.attributes as Record<string, unknown>).manufacturer).toBe('BrandX')
  })

  it('round-trips title and vendor', () => {
    const canonical = transformProduct(makeProduct())
    const body = untransformProduct(canonical)
    expect((body.attributes as Record<string, unknown>).title).toBe('Wireless Keyboard')
    expect((body.attributes as Record<string, unknown>).manufacturer).toBe('Acme')
  })

  it('resolves ean from explicit argument', () => {
    const body = untransformProduct({ title: 'Test' }, '9876543210987')
    expect(body.ean).toBe('9876543210987')
  })
})
