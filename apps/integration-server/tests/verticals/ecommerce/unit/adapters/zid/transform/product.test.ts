import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
  untransformProduct,
  type RawZidProduct,
  type RawZidVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/zid/transform/product'
import {
  ProductSchema,
  ProductVariantSchema,
} from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeVariant(overrides: Partial<RawZidVariant> = {}): RawZidVariant {
  return {
    id: 2001,
    sku: 'ACS-001-RED',
    barcode: '6281234567890',
    price: '120.00',
    sale_price: null,
    quantity: 15,
    attributes: [{ name: { en: 'Color', ar: 'اللون' }, value: { en: 'Red', ar: 'أحمر' } }],
    ...overrides,
  }
}

function makeProduct(overrides: Partial<RawZidProduct> = {}): RawZidProduct {
  return {
    id: 1001,
    sku: 'ACS-001',
    slug: 'arabic-coffee-set',
    name: { en: 'Arabic Coffee Set', ar: 'طقم قهوة عربية' },
    description: { en: '<p>Traditional Arabic coffee set.</p>', ar: null },
    price: '120.00',
    sale_price: null,
    currency: 'SAR',
    quantity: 20,
    is_draft: false,
    is_published: true,
    images: [
      {
        large: 'https://cdn.zid.store/products/arabic-coffee-set-lg.jpg',
        original: 'https://cdn.zid.store/products/arabic-coffee-set.jpg',
      },
    ],
    options: [
      {
        name: { en: 'Color', ar: 'اللون' },
        values: [
          { en: 'Red', ar: 'أحمر' },
          { en: 'Gold', ar: 'ذهبي' },
        ],
      },
    ],
    variants: [makeVariant()],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-15T09:30:00Z',
    ...overrides,
  }
}

describe('transformVariant (Zid)', () => {
  it('maps numeric id to string', () => {
    const result = transformVariant(makeVariant(), 'SAR', '1001')
    expect(result.id).toBe('2001')
  })

  it('maps sku', () => {
    const result = transformVariant(makeVariant(), 'SAR', '1001')
    expect(result.sku).toBe('ACS-001-RED')
  })

  it('maps barcode', () => {
    const result = transformVariant(makeVariant(), 'SAR', '1001')
    expect(result.barcode).toBe('6281234567890')
  })

  it('sets productId from parameter', () => {
    const result = transformVariant(makeVariant(), 'SAR', '1001')
    expect(result.productId).toBe('1001')
  })

  it('converts major-unit price to minor units (SAR × 100)', () => {
    const result = transformVariant(makeVariant({ price: '120.00' }), 'SAR', '1001')
    // 120 SAR = 12000 halalas
    expect(result.price).toEqual({ amount: 12000, currency: 'SAR' })
  })

  it('leaves compareAtPrice undefined when sale_price is null', () => {
    const result = transformVariant(makeVariant({ sale_price: null }), 'SAR', '1001')
    expect(result.compareAtPrice).toBeUndefined()
  })

  it('maps localised attribute names and values to optionValues', () => {
    const result = transformVariant(makeVariant(), 'SAR', '1001')
    expect(result.optionValues).toEqual({ Color: 'Red' })
  })

  it('produces a payload satisfying ProductVariantSchema', () => {
    const result = transformVariant(makeVariant(), 'SAR', '1001')
    expect(() => ProductVariantSchema.parse(result)).not.toThrow()
  })
})

describe('transformProduct (Zid)', () => {
  it('maps numeric id to string', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('1001')
  })

  it('prefers English name for title', () => {
    const result = transformProduct(makeProduct())
    expect(result.title).toBe('Arabic Coffee Set')
  })

  it('falls back to Arabic when English name is absent', () => {
    const result = transformProduct(makeProduct({ name: { en: null, ar: 'طقم قهوة' } }))
    expect(result.title).toBe('طقم قهوة')
  })

  it('maps English description', () => {
    const result = transformProduct(makeProduct())
    expect(result.description).toBe('<p>Traditional Arabic coffee set.</p>')
  })

  it('maps slug to handle', () => {
    const result = transformProduct(makeProduct())
    expect(result.handle).toBe('arabic-coffee-set')
  })

  it('maps is_published true to ACTIVE status', () => {
    const result = transformProduct(makeProduct({ is_draft: false, is_published: true }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps is_draft true to DRAFT status', () => {
    const result = transformProduct(makeProduct({ is_draft: true, is_published: false }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps is_published false to ARCHIVED status', () => {
    const result = transformProduct(makeProduct({ is_draft: false, is_published: false }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps images using large URL first', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://cdn.zid.store/products/arabic-coffee-set-lg.jpg')
  })

  it('maps options with localised name and values', () => {
    const result = transformProduct(makeProduct())
    expect(result.options).toHaveLength(1)
    expect(result.options![0]!.name).toBe('Color')
    expect(result.options![0]!.values).toEqual(['Red', 'Gold'])
  })

  it('maps variants', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.id).toBe('2001')
  })

  it('sets publishedAt to created_at when is_published is true', () => {
    const result = transformProduct(
      makeProduct({ is_published: true, created_at: '2026-01-01T00:00:00Z' }),
    )
    expect(result.publishedAt).toBe('2026-01-01T00:00:00Z')
  })

  it('leaves publishedAt undefined when not published', () => {
    const result = transformProduct(makeProduct({ is_published: false }))
    expect(result.publishedAt).toBeUndefined()
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformProduct(makeProduct())
    expect(result.createdAt).toBe('2026-01-01T00:00:00Z')
    expect(result.updatedAt).toBe('2026-01-15T09:30:00Z')
  })

  it('produces a payload satisfying ProductSchema', () => {
    const result = transformProduct(makeProduct())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('untransformProduct (Zid)', () => {
  it('maps title to localised name', () => {
    const body = untransformProduct({ title: 'Coffee Set' })
    expect(body.name).toBe('Coffee Set')
  })

  it('maps handle to slug', () => {
    const body = untransformProduct({ handle: 'arabic-coffee-set' })
    expect(body.slug).toBe('arabic-coffee-set')
  })

  it('maps ACTIVE status to is_published=true and is_draft=false', () => {
    const body = untransformProduct({ status: 'ACTIVE' })
    expect(body.is_published).toBe(true)
    expect(body.is_draft).toBe(false)
  })

  it('maps DRAFT status', () => {
    const body = untransformProduct({ status: 'DRAFT' })
    expect(body.is_draft).toBe(true)
    expect(body.is_published).toBe(false)
  })

  it('maps ARCHIVED status', () => {
    const body = untransformProduct({ status: 'ARCHIVED' })
    expect(body.is_published).toBe(false)
  })
})
