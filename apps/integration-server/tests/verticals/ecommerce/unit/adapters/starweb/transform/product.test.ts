import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
  untransformProduct,
  untransformVariant,
  type RawStarwebProduct,
  type RawStarwebVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/starweb/transform/product'
import {
  ProductSchema,
  ProductVariantSchema,
} from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeVariant(overrides: Partial<RawStarwebVariant> = {}): RawStarwebVariant {
  return {
    variantId: 201,
    sku: 'KB-001-BLK',
    ean: '1234567890123',
    isActive: true,
    sortIndex: 0,
    stockQuantity: 15,
    weightInKg: 0.85,
    prices: [{ pricelistId: 1, price: 479.0, currency: 'SEK' }],
    attributeValues: [{ attributeName: 'Color', attributeValue: 'Black' }],
    ...overrides,
  }
}

function makeProduct(overrides: Partial<RawStarwebProduct> = {}): RawStarwebProduct {
  return {
    productId: 101,
    createdAt: '2024-01-15T09:00:00.000Z',
    modifiedAt: '2024-06-01T12:00:00.000Z',
    visibility: 'visible',
    type: 'basic',
    languages: {
      data: [
        {
          langCode: 'sv',
          name: 'Wireless Keyboard',
          shortDescription: 'Compact wireless keyboard',
          longDescription: 'A premium compact wireless keyboard for home and office.',
          url: 'wireless-keyboard',
        },
      ],
    },
    variants: { data: [makeVariant()] },
    mediaFiles: {
      data: [
        {
          fileId: 10,
          fileName: 'keyboard.jpg',
          fileUrl: 'https://cdn.example.com/keyboard.jpg',
          sortIndex: 0,
        },
      ],
    },
    ...overrides,
  }
}

describe('transformProduct (Starweb)', () => {
  it('stringifies productId as id', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('101')
  })

  it('maps name from first language entry', () => {
    const result = transformProduct(makeProduct())
    expect(result.title).toBe('Wireless Keyboard')
  })

  it('maps longDescription to description', () => {
    const result = transformProduct(makeProduct())
    expect(result.description).toBe(
      'A premium compact wireless keyboard for home and office.',
    )
  })

  it('maps visibility=visible to ACTIVE status', () => {
    const result = transformProduct(makeProduct())
    expect(result.status).toBe('ACTIVE')
  })

  it('maps visibility=hidden to DRAFT status', () => {
    const result = transformProduct(makeProduct({ visibility: 'hidden' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps variants from variants.data envelope', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('201')
    expect(v.sku).toBe('KB-001-BLK')
    expect(v.barcode).toBe('1234567890123')
  })

  it('builds options from variant attributeValues', () => {
    const result = transformProduct(makeProduct())
    expect(result.options).toHaveLength(1)
    expect(result.options![0]!.name).toBe('Color')
    expect(result.options![0]!.values).toContain('Black')
  })

  it('maps images from mediaFiles.data envelope', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://cdn.example.com/keyboard.jpg')
    expect(result.images![0]!.id).toBe('10')
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformProduct(makeProduct())
    expect(result.createdAt).toBe('2024-01-15T09:00:00.000Z')
    expect(result.updatedAt).toBe('2024-06-01T12:00:00.000Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeProduct()
    expect(transformProduct(raw).metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    expect(() => ProductSchema.parse(transformProduct(makeProduct()))).not.toThrow()
  })

  it('round-trips visibility via untransformProduct', () => {
    const canonical = transformProduct(makeProduct())
    const body = untransformProduct(canonical)
    expect(body['visibility']).toBe('visible')
    const langs = body['languages'] as Array<{ name: string; longDescription: string }>
    expect(langs[0]!.name).toBe('Wireless Keyboard')
    expect(langs[0]!.longDescription).toBe(
      'A premium compact wireless keyboard for home and office.',
    )
  })
})

describe('transformVariant (Starweb)', () => {
  it('stringifies variantId as id and links productId', () => {
    const result = transformVariant(makeVariant(), 'prod-101')
    expect(result.id).toBe('201')
    expect(result.productId).toBe('prod-101')
  })

  it('maps sku and barcode (ean)', () => {
    const result = transformVariant(makeVariant(), 'prod-101')
    expect(result.sku).toBe('KB-001-BLK')
    expect(result.barcode).toBe('1234567890123')
  })

  it('converts weightInKg to grams', () => {
    const result = transformVariant(makeVariant(), 'prod-101')
    // 0.85 kg × 1000 = 850 g
    expect(result.weight).toBe(850)
    expect(result.weightUnit).toBe('g')
  })

  it('converts major-unit price to minor units', () => {
    const result = transformVariant(makeVariant(), 'prod-101', 'SEK')
    // 479.00 SEK × 100 = 47900 öre
    expect(result.price).toEqual({ amount: 47900, currency: 'SEK' })
  })

  it('maps optionValues from attributeValues', () => {
    const result = transformVariant(makeVariant(), 'prod-101')
    expect(result.optionValues).toEqual({ Color: 'Black' })
  })

  it('produces a schema-valid variant', () => {
    expect(() =>
      ProductVariantSchema.parse(transformVariant(makeVariant(), 'prod-101')),
    ).not.toThrow()
  })

  it('round-trips via untransformVariant', () => {
    const body = untransformVariant({ sku: 'KB-001-BLK', barcode: '1234567890123', weight: 850, weightUnit: 'g' })
    expect(body['sku']).toBe('KB-001-BLK')
    expect(body['ean']).toBe('1234567890123')
    // 850g → 0.85 kg
    expect(body['weightInKg']).toBeCloseTo(0.85, 2)
    expect(body['isActive']).toBe(true)
  })
})
