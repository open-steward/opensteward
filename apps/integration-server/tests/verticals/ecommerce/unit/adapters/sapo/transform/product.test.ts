import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  type RawSapoProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/sapo/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawSapoProduct> = {}): RawSapoProduct {
  return {
    id: 301,
    name: 'Áo Thun Nam',
    content: '<p>Áo thun cotton cao cấp</p>',
    alias: 'ao-thun-nam',
    vendor: 'Viet Fashion',
    product_type: 'Clothing',
    tags: 'ao, nam, cotton',
    published_on: '2024-03-01T00:00:00Z',
    created_on: '2024-02-15T08:00:00Z',
    modified_on: '2024-05-10T11:00:00Z',
    options: [
      { id: 10, name: 'Size', position: 1, values: ['S', 'M', 'L'] },
      { id: 11, name: 'Color', position: 2, values: ['Trắng', 'Đen'] },
    ],
    variants: [
      {
        id: 401,
        product_id: 301,
        title: 'S / Trắng',
        price: '150000',
        compare_at_price: '200000',
        sku: 'AT-S-W',
        barcode: '8934563012345',
        position: 1,
        weight: 200,
        weight_unit: 'g',
        taxable: true,
        requires_shipping: true,
        option1: 'S',
        option2: 'Trắng',
      },
    ],
    images: [
      {
        id: 501,
        product_id: 301,
        position: 1,
        src: 'https://cdn.sapo.vn/img/ao-thun-nam.jpg',
        alt: 'Áo Thun Nam',
        width: 1000,
        height: 1000,
      },
    ],
    ...overrides,
  }
}

describe('transformProduct (Sapo)', () => {
  it('maps name → title and alias → handle', () => {
    const result = transformProduct(makeProduct())
    expect(result.title).toBe('Áo Thun Nam')
    expect(result.handle).toBe('ao-thun-nam')
  })

  it('maps content → description', () => {
    const result = transformProduct(makeProduct())
    expect(result.description).toBe('<p>Áo thun cotton cao cấp</p>')
  })

  it('derives ACTIVE status from published_on presence', () => {
    const result = transformProduct(makeProduct())
    expect(result.status).toBe('ACTIVE')
  })

  it('returns undefined status when published_on is absent', () => {
    const result = transformProduct(makeProduct({ published_on: undefined }))
    expect(result.status).toBeUndefined()
  })

  it('splits tags', () => {
    const result = transformProduct(makeProduct())
    expect(result.tags).toEqual(['ao', 'nam', 'cotton'])
  })

  it('maps options with ids and values', () => {
    const result = transformProduct(makeProduct())
    expect(result.options).toHaveLength(2)
    expect(result.options![0]!.name).toBe('Size')
    expect(result.options![0]!.values).toEqual(['S', 'M', 'L'])
  })

  it('maps variant with VND price (no scaling)', () => {
    const result = transformProduct(makeProduct())
    const v = result.variants![0]!
    expect(v.id).toBe('401')
    expect(v.sku).toBe('AT-S-W')
    // VND: majorToMinor(150000, 'VND') === 150000
    expect(v.price).toEqual({ amount: 150000, currency: 'VND' })
    expect(v.compareAtPrice).toEqual({ amount: 200000, currency: 'VND' })
  })

  it('maps variant optionValues from option1/option2 positional fields', () => {
    const result = transformProduct(makeProduct())
    const v = result.variants![0]!
    expect(v.optionValues).toEqual({ Size: 'S', Color: 'Trắng' })
  })

  it('maps images with url from src', () => {
    const result = transformProduct(makeProduct())
    const img = result.images![0]!
    expect(img.id).toBe('501')
    expect(img.url).toBe('https://cdn.sapo.vn/img/ao-thun-nam.jpg')
    expect(img.alt).toBe('Áo Thun Nam')
  })

  it('maps created_on/modified_on/published_on timestamps', () => {
    const result = transformProduct(makeProduct())
    expect(result.createdAt).toBe('2024-02-15T08:00:00Z')
    expect(result.updatedAt).toBe('2024-05-10T11:00:00Z')
    expect(result.publishedAt).toBe('2024-03-01T00:00:00Z')
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

  it('round-trips via untransformProduct', () => {
    const canonical = transformProduct(makeProduct())
    const raw = untransformProduct(canonical)
    expect(raw.name).toBe('Áo Thun Nam')
    expect(raw.alias).toBe('ao-thun-nam')
    expect(raw.content).toBe('<p>Áo thun cotton cao cấp</p>')
    expect(raw.vendor).toBe('Viet Fashion')
  })
})
