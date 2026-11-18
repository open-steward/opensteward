/**
 * Marketplacer Advert/Variant transform tests. Fixtures follow the shapes
 * confirmed in
 * https://api.marketplacer.com/docs/seller-api/examples/products/howto_queryadverts/
 * and https://api.marketplacer.com/docs/seller-api/reference/queries/node/.
 */
import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
  untransformProduct,
  untransformVariant,
  type RawMarketplacerAdvert,
  type RawMarketplacerVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/marketplacer/transform/product'
import { ProductSchema, ProductVariantSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeAdvert(overrides: Partial<RawMarketplacerAdvert> = {}): RawMarketplacerAdvert {
  return {
    id: 'QWR2ZXJ0LTEwMDI4MzYzNQ==',
    title: '4G Phone',
    description: 'A great 4g Phone',
    published: true,
    displayable: true,
    online: true,
    lowestPrice: '99.99',
    lowestOriginalPrice: '129.99',
    brand: { id: 'QnJhbmQtMjQ5', name: 'Namsung' },
    variants: {
      nodes: [
        {
          id: 'VmFyaWFudC0zNQ==',
          label: 'White',
          sku: 'PHN-WHT',
          barcode: '2579325358052',
          countOnHand: 12,
          published: true,
          displayable: true,
          buyable: true,
        },
      ],
    },
    ...overrides,
  }
}

describe('transformProduct (Marketplacer)', () => {
  it('maps core advert fields', () => {
    const result = transformProduct(makeAdvert(), 'AUD')
    expect(result.id).toBe('QWR2ZXJ0LTEwMDI4MzYzNQ==')
    expect(result.title).toBe('4G Phone')
    expect(result.description).toBe('A great 4g Phone')
    expect(result.vendor).toBe('Namsung')
  })

  it.each([
    [{ published: false }, 'ARCHIVED'],
    [{ published: true, displayable: false }, 'DRAFT'],
    [{ published: true, displayable: true }, 'ACTIVE'],
  ] as const)('maps advert state %j to status %s', (overrides, status) => {
    expect(transformProduct(makeAdvert(overrides), 'AUD').status).toBe(status)
  })

  it('converts the Advert-level price to variant minor units, shared by every variant', () => {
    const result = transformProduct(makeAdvert(), 'AUD')
    const v = result.variants![0]!
    expect(v.price).toEqual({ amount: 9999, currency: 'AUD' })
    expect(v.compareAtPrice).toEqual({ amount: 12999, currency: 'AUD' })
  })

  it('throws rather than inventing a price when the advert has none', () => {
    expect(() => transformProduct(makeAdvert({ lowestPrice: null }), 'AUD')).toThrow(/no usable price/)
  })

  it('requires an explicit currency — there is no platform default', () => {
    // @ts-expect-error — currency is required, not optional
    expect(() => transformProduct(makeAdvert())).toThrow()
  })

  it('preserves raw in metadata', () => {
    const raw = makeAdvert()
    expect(transformProduct(raw, 'AUD').metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    expect(() => ProductSchema.parse(transformProduct(makeAdvert(), 'AUD'))).not.toThrow()
  })
})

function makeVariant(overrides: Partial<RawMarketplacerVariant> = {}): RawMarketplacerVariant {
  return {
    id: 'VmFyaWFudC0zNQ==',
    label: 'White',
    sku: 'PHN-WHT',
    barcode: '2579325358052',
    countOnHand: 12,
    published: true,
    displayable: true,
    buyable: true,
    ...overrides,
  }
}

describe('transformVariant (Marketplacer)', () => {
  it('maps variant fields, inheriting the Advert price', () => {
    const result = transformVariant(makeVariant(), {
      productId: 'QWR2ZXJ0LTEwMDI4MzYzNQ==',
      price: '99.99',
      currency: 'AUD',
    })
    expect(result.id).toBe('VmFyaWFudC0zNQ==')
    expect(result.productId).toBe('QWR2ZXJ0LTEwMDI4MzYzNQ==')
    expect(result.sku).toBe('PHN-WHT')
    expect(result.barcode).toBe('2579325358052')
    expect(result.title).toBe('White')
    expect(result.price).toEqual({ amount: 9999, currency: 'AUD' })
  })

  it('omits compareAtPrice when it is not higher than price', () => {
    const result = transformVariant(makeVariant(), {
      productId: 'p1',
      price: '99.99',
      compareAtPrice: '99.99',
      currency: 'AUD',
    })
    expect(result.compareAtPrice).toBeUndefined()
  })

  it('throws when no price is available, rather than defaulting to zero', () => {
    expect(() =>
      transformVariant(makeVariant(), { productId: 'p1', price: undefined, currency: 'AUD' }),
    ).toThrow(/no usable price/)
  })

  it('produces schema-valid output', () => {
    const result = transformVariant(makeVariant(), { productId: 'p1', price: '10.00', currency: 'AUD' })
    expect(() => ProductVariantSchema.parse(result)).not.toThrow()
  })
})

describe('untransformProduct (Marketplacer)', () => {
  it('maps title/description/price and requires metadata for brand/taxon', () => {
    const canonical = transformProduct(makeAdvert(), 'AUD')
    const attrs = untransformProduct(
      { ...canonical, metadata: { brandId: 'QnJhbmQtMjQ5', taxonId: 'VGF4b24tMjk2OA==' } },
      'AUD',
    )
    expect(attrs.title).toBe('4G Phone')
    expect(attrs.description).toBe('A great 4g Phone')
    expect(attrs.price).toBe('99.99')
    expect(attrs.brandId).toBe('QnJhbmQtMjQ5')
    expect(attrs.taxonId).toBe('VGF4b24tMjk2OA==')
  })

  it('omits brandId/taxonId when metadata does not carry them (caller must supply)', () => {
    const attrs = untransformProduct({ title: 'x' }, 'AUD')
    expect(attrs.brandId).toBeUndefined()
    expect(attrs.taxonId).toBeUndefined()
  })

  it('maps images to sourceUrl input', () => {
    const attrs = untransformProduct(
      { images: [{ url: 'https://images.com/mobile.jpg' }] },
      'AUD',
    )
    expect(attrs.images).toEqual([{ sourceUrl: 'https://images.com/mobile.jpg' }])
  })
})

describe('untransformVariant (Marketplacer)', () => {
  it('maps barcode/sku/id and reads optionValueIds from metadata', () => {
    const attrs = untransformVariant({
      id: 'VmFyaWFudC0zNQ==',
      barcode: '2579325358052',
      sku: 'PHN-WHT',
      metadata: { optionValueIds: ['T3B0aW9uVmFsdWUtNzM0'] },
    })
    expect(attrs).toEqual({
      id: 'VmFyaWFudC0zNQ==',
      barcode: '2579325358052',
      sku: 'PHN-WHT',
      optionValueIds: ['T3B0aW9uVmFsdWUtNzM0'],
    })
  })

  it('omits optionValueIds when metadata does not carry an array', () => {
    const attrs = untransformVariant({ id: 'v1' })
    expect(attrs.optionValueIds).toBeUndefined()
  })
})

describe('transformProduct (marketplacer): no invented title', () => {
  it('throws rather than giving a product with no title an empty one', () => {
    expect(() => transformProduct({ ...makeAdvert(), title: undefined } as ReturnType<typeof makeAdvert>, 'AUD')).toThrow(/no title/)
  })
})
