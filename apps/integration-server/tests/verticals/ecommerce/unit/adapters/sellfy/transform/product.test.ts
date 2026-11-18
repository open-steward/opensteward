import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
  untransformProduct,
  untransformVariant,
  type RawShopifyProduct,
  type RawShopifyVariant,
  type RawShopifyOption,
} from '../../../../../../../src/verticals/ecommerce/adapters/sellfy/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawShopifyProduct> = {}): RawShopifyProduct {
  return {
    id: 123,
    title: 'Digital Download',
    body_html: '<p>A great digital product.</p>',
    handle: 'digital-download',
    status: 'active',
    vendor: 'Sellfy Store',
    product_type: 'Digital',
    tags: 'digital, download, ebook',
    options: [
      { id: 10, name: 'Format', position: 1, values: ['PDF', 'EPUB'] },
      { id: 11, name: 'License', position: 2, values: ['Personal'] },
    ],
    variants: [
      {
        id: 501,
        product_id: 123,
        title: 'PDF / Personal',
        sku: 'DL-PDF-PERS',
        barcode: '9780000000001',
        price: '19.99',
        compare_at_price: '24.99',
        position: 1,
        inventory_item_id: 601,
        weight: 0,
        weight_unit: 'kg',
        taxable: false,
        requires_shipping: false,
        option1: 'PDF',
        option2: 'Personal',
      },
    ],
    images: [
      {
        id: 800,
        position: 1,
        src: 'https://cdn.sellfy.com/img/cover.jpg',
        alt: 'Cover',
        width: 800,
        height: 600,
      },
    ],
    created_at: '2024-03-01T10:00:00Z',
    updated_at: '2024-04-01T08:00:00Z',
    published_at: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

const defaultOptions: RawShopifyOption[] = [
  { id: 10, name: 'Format', position: 1, values: ['PDF', 'EPUB'] },
]

describe('transformProduct', () => {
  it('maps core fields and stringifies id', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.id).toBe('123')
    expect(typeof result.id).toBe('string')
    expect(result.title).toBe('Digital Download')
    expect(result.handle).toBe('digital-download')
    expect(result.status).toBe('ACTIVE')
  })

  it('maps price and currency to minor units', () => {
    const result = transformProduct(makeProduct())
    const variant = result.variants![0]!
    expect(variant.price).toEqual({ amount: 1999, currency: 'USD' })
    expect(variant.compareAtPrice).toEqual({ amount: 2499, currency: 'USD' })
  })

  it('maps variant option values from option1/option2 fields', () => {
    const result = transformProduct(makeProduct())
    const variant = result.variants![0]!
    expect(variant.optionValues).toEqual({ Format: 'PDF', License: 'Personal' })
    expect(variant.id).toBe('501')
  })

  it('splits tags into array', () => {
    const result = transformProduct(makeProduct())
    expect(result.tags).toEqual(['digital', 'download', 'ebook'])
  })

  it('maps images with url and alt', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://cdn.sellfy.com/img/cover.jpg')
    expect(result.images![0]!.alt).toBe('Cover')
  })

  it('maps vendor, productType, and description', () => {
    const result = transformProduct(makeProduct())
    expect(result.vendor).toBe('Sellfy Store')
    expect(result.productType).toBe('Digital')
    expect(result.description).toBe('<p>A great digital product.</p>')
  })

  it('maps dates', () => {
    const result = transformProduct(makeProduct())
    expect(result.createdAt).toBe('2024-03-01T10:00:00Z')
    expect(result.updatedAt).toBe('2024-04-01T08:00:00Z')
    expect(result.publishedAt).toBe('2024-03-02T00:00:00Z')
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

  it('round-trips writable fields via untransformProduct', () => {
    const canonical = transformProduct(makeProduct())
    const raw = untransformProduct(canonical)
    expect(raw.title).toBe('Digital Download')
    expect(raw.handle).toBe('digital-download')
    expect(raw.vendor).toBe('Sellfy Store')
    expect(raw.status).toBe('active')
    expect(raw.tags).toBe('digital, download, ebook')
  })
})

describe('transformVariant', () => {
  it('stringifies id and maps price', () => {
    const raw: RawShopifyVariant = {
      id: 999,
      product_id: 123,
      price: '9.99',
      sku: 'VAR-001',
    }
    const result = transformVariant(raw, 'USD', defaultOptions)
    expect(result.id).toBe('999')
    expect(result.price).toEqual({ amount: 999, currency: 'USD' })
  })

  it('maps option values from positional fields', () => {
    const raw: RawShopifyVariant = {
      id: 100,
      option1: 'PDF',
      option2: null,
      option3: null,
    }
    const result = transformVariant(raw, 'USD', defaultOptions)
    expect(result.optionValues).toEqual({ Format: 'PDF' })
    expect(result.id).toBe('100')
  })

  it('round-trips writable fields via untransformVariant', () => {
    const raw: RawShopifyVariant = {
      id: 200,
      sku: 'VAR-200',
      price: '5.00',
      taxable: true,
    }
    const canonical = transformVariant(raw)
    const back = untransformVariant(canonical)
    expect(back.sku).toBe('VAR-200')
    expect(back.taxable).toBe(true)
  })
})
