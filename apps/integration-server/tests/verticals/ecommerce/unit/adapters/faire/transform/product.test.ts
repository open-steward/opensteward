import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
  variantPrice,
} from '../../../../../../../src/verticals/ecommerce/adapters/faire/transform/product'
import {
  ProductSchema,
  ProductVariantSchema,
} from '../../../../../../../src/verticals/ecommerce/schema/product'
import { docProduct, docVariant } from '../fixtures'

describe('transformProduct (Faire ExternalProductV2)', () => {
  it('maps the documented sample product and parses as a canonical Product', () => {
    const p = ProductSchema.parse(transformProduct(docProduct()))
    expect(p.id).toBe('p_123')
    expect(p.title).toBe("Faire's fantastic candle")
    expect(p.description).toMatch(/^Glad you decided/)
    expect(p.status).toBe('DRAFT')
    expect(p.productType).toBe('Votive Candle')
    expect(p.options).toEqual([{ name: 'Scent', values: ['Cinnamon', 'Skunk', 'Vanilla'] }])
    expect(p.createdAt).toBe('2019-03-14T00:09:15.000Z')
    expect(p.updatedAt).toBe('2019-03-15T00:09:15.000Z')
    expect(p.metadata.brand_id).toBe('b_abc')
  })

  it('reads variants from `variants`, not the retired `options` array', () => {
    const p = transformProduct(docProduct())
    // The canonical variant id is productId:variantId, readable by getVariant.
    expect(p.variants?.map((v) => v.id)).toEqual(['p_123:po_123'])
    expect(p.variants?.[0]?.productId).toBe('p_123')
    const legacy = transformProduct(
      docProduct({ variants: undefined, options: [docVariant({ id: 'po_legacy' })] }),
    )
    expect(legacy.variants).toBeUndefined()
  })

  it('maps lifecycle_state to status', () => {
    expect(transformProduct(docProduct({ lifecycle_state: 'PUBLISHED' })).status).toBe('ACTIVE')
    expect(transformProduct(docProduct({ lifecycle_state: 'UNPUBLISHED' })).status).toBe('ARCHIVED')
    expect(transformProduct(docProduct({ lifecycle_state: 'DELETED' })).status).toBe('ARCHIVED')
    expect(transformProduct(docProduct({ lifecycle_state: undefined })).status).toBeUndefined()
  })

  it('maps images (ExternalImageV2) with sequence as position', () => {
    const p = ProductSchema.parse(
      transformProduct(
        docProduct({
          images: [
            {
              id: 'i_adqaiy3htm',
              width: 1000,
              height: 1000,
              sequence: 0,
              url: 'https://cdn.faire.com/374cd3041a4c4.png',
            },
            { id: 'i_nourl', sequence: 1 },
          ],
        }),
      ),
    )
    expect(p.images).toEqual([
      {
        id: 'i_adqaiy3htm',
        url: 'https://cdn.faire.com/374cd3041a4c4.png',
        width: 1000,
        height: 1000,
        position: 0,
      },
    ])
  })

  it('does not take the description from short_description', () => {
    expect(transformProduct(docProduct({ description: undefined })).description).toBeUndefined()
  })

  it('throws on a product with no name instead of inventing a title', () => {
    expect(() => transformProduct(docProduct({ name: undefined }))).toThrow(/no name/)
  })
})

describe('transformVariant (Faire ExternalProductVariantV2)', () => {
  it('maps the documented sample variant and parses as a canonical ProductVariant', () => {
    const v = ProductVariantSchema.parse(transformVariant(docVariant(), 'p_123'))
    expect(v.id).toBe('p_123:po_123')
    expect(v.productId).toBe('p_123')
    expect(v.sku).toBe('vanilla-2019')
    expect(v.title).toBe('Vanilla Scent')
    expect(v.optionValues).toEqual({ Scent: 'Vanilla' })
    expect(v.price).toEqual({ amount: 299, currency: 'USD' })
  })

  it('maps gtin to barcode', () => {
    expect(transformVariant(docVariant({ gtin: '012345678905' }), 'p_123').barcode).toBe(
      '012345678905',
    )
  })
})

describe('variantPrice', () => {
  it('prefers the USA prices[] entry (ExternalMoneyV2, with its currency)', () => {
    const v = docVariant({
      prices: [
        {
          geo_constraint: { country_group: 'EUROPEAN_UNION' },
          wholesale_price: { amount_minor: 300, currency: 'EUR' },
        },
        {
          geo_constraint: { country: 'USA' },
          wholesale_price: { amount_minor: 4999, currency: 'USD' },
        },
      ],
    })
    expect(variantPrice(v)).toEqual({ amount: 4999, currency: 'USD' })
  })

  it('falls back to wholesale_price_cents, documented as US dollar cents', () => {
    expect(variantPrice(docVariant())).toEqual({ amount: 299, currency: 'USD' })
  })

  it('uses a sole regional price when there is no USA entry and no cents field', () => {
    const v = docVariant({
      wholesale_price_cents: undefined,
      prices: [
        {
          geo_constraint: { country: 'GBR' },
          wholesale_price: { amount_minor: 250, currency: 'GBP' },
        },
      ],
    })
    expect(variantPrice(v)).toEqual({ amount: 250, currency: 'GBP' })
  })

  it('throws rather than invent a price or currency', () => {
    expect(() => variantPrice(docVariant({ wholesale_price_cents: undefined }))).toThrow(
      /no single documented wholesale price/,
    )
    const ambiguous = docVariant({
      wholesale_price_cents: undefined,
      prices: [
        {
          geo_constraint: { country: 'GBR' },
          wholesale_price: { amount_minor: 250, currency: 'GBP' },
        },
        {
          geo_constraint: { country: 'CAN' },
          wholesale_price: { amount_minor: 400, currency: 'CAD' },
        },
      ],
    })
    expect(() => variantPrice(ambiguous)).toThrow(/2 regional prices/)
    const noCurrency = docVariant({
      wholesale_price_cents: undefined,
      prices: [{ geo_constraint: { country: 'USA' }, wholesale_price: { amount_minor: 250 } }],
    })
    expect(() => variantPrice(noCurrency)).toThrow()
  })
})
