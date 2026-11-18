import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformSku,
  untransformProduct,
  untransformSku,
  type RawJoorProduct,
  type RawJoorSku,
} from '../../../../../../../src/verticals/ecommerce/adapters/joor/transform/product'
import {
  ProductSchema,
  ProductVariantSchema,
} from '../../../../../../../src/verticals/ecommerce/schema/product'

describe('transformProduct (joor)', () => {
  const rawSkus: RawJoorSku[] = [
    {
      id: 'sku-001',
      product_id: 'prod-abc',
      sku_identifier: 'WK-BLK-S',
      identifiers: [{ type: 'upc', value: '012345678901' }],
      trait_values: [
        { trait: { id: 't1', name: 'Color' }, value: 'Black' },
        { trait: { id: 't2', name: 'Size' }, value: 'S' },
      ],
    },
    {
      id: 'sku-002',
      product_id: 'prod-abc',
      sku_identifier: 'WK-WHT-M',
      trait_values: [
        { trait: { id: 't1', name: 'Color' }, value: 'White' },
        { trait: { id: 't2', name: 'Size' }, value: 'M' },
      ],
    },
  ]

  const rawProduct: RawJoorProduct = {
    id: 'prod-abc',
    name: 'Classic Tee',
    external_id: 'classic-tee',
    description: 'A versatile classic tee.',
    images: [{ id: 'img-1', url: 'https://cdn.example.com/tee.jpg' }],
    tags: [{ id: 'tag1', name: 'category', value: 'Tops' }],
    categories: [{ id: 'cat1', name: 'Apparel' }],
  }

  it('maps id directly', () => {
    const result = transformProduct(rawProduct, rawSkus)
    expect(result.id).toBe('prod-abc')
  })

  it('maps title from name', () => {
    const result = transformProduct(rawProduct, rawSkus)
    expect(result.title).toBe('Classic Tee')
  })

  it('maps handle from external_id', () => {
    const result = transformProduct(rawProduct, rawSkus)
    expect(result.handle).toBe('classic-tee')
  })

  it('maps description', () => {
    const result = transformProduct(rawProduct, rawSkus)
    expect(result.description).toBe('A versatile classic tee.')
  })

  it('maps productType from categories[0].name', () => {
    const result = transformProduct(rawProduct, rawSkus)
    expect(result.productType).toBe('Apparel')
  })

  it('maps tags as name:value pairs', () => {
    const result = transformProduct(rawProduct, rawSkus)
    expect(result.tags).toContain('category:Tops')
  })

  it('embeds no variants: a JOOR SKU carries no price and the canonical variant requires one', () => {
    // GET /v4/skus documents id, product_id, identifiers, trait_values,
    // external_id and sku_identifier only; v4 has no read endpoint for prices.
    const result = transformProduct(rawProduct, rawSkus)
    expect(result.variants).toBeUndefined()
  })

  it('builds options from sku trait_values', () => {
    const result = transformProduct(rawProduct, rawSkus)
    const optionNames = result.options?.map((o) => o.name)
    expect(optionNames).toContain('Color')
    expect(optionNames).toContain('Size')
  })

  it('maps images', () => {
    const result = transformProduct(rawProduct, rawSkus)
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://cdn.example.com/tee.jpg')
  })

  it('produces schema-valid output', () => {
    const result = transformProduct(rawProduct, rawSkus)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformProduct', () => {
    const result = transformProduct(rawProduct, rawSkus)
    const back = untransformProduct(result)
    expect(back.name).toBe(rawProduct.name)
    expect(back.external_id).toBe(rawProduct.external_id)
  })
})

describe('transformSku (joor)', () => {
  const rawSku: RawJoorSku = {
    id: 'sku-001',
    product_id: 'prod-abc',
    sku_identifier: 'WK-BLK-S',
    external_id: 'ext-sku-001',
    identifiers: [{ type: 'upc', value: '012345678901' }],
    trait_values: [{ trait: { id: 't1', name: 'Color' }, value: 'Black' }],
  }

  it('maps id directly', () => {
    const result = transformSku(rawSku)
    expect(result.id).toBe('sku-001')
  })

  it('maps productId', () => {
    const result = transformSku(rawSku)
    expect(result.productId).toBe('prod-abc')
  })

  it('maps sku from sku_identifier', () => {
    const result = transformSku(rawSku)
    expect(result.sku).toBe('WK-BLK-S')
  })

  it('maps barcode from UPC identifier', () => {
    const result = transformSku(rawSku)
    expect(result.barcode).toBe('012345678901')
  })

  it('defaults price to 0/USD since JOOR has no per-SKU price', () => {
    const result = transformSku(rawSku)
    expect(result.price).toEqual({ amount: 0, currency: 'USD' })
  })

  it('maps optionValues from trait_values', () => {
    const result = transformSku(rawSku)
    expect(result.optionValues).toEqual({ Color: 'Black' })
  })

  it('produces schema-valid output', () => {
    const result = transformSku(rawSku)
    expect(() => ProductVariantSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformSku', () => {
    const result = transformSku(rawSku)
    const back = untransformSku(result)
    expect(back.sku_identifier).toBe(rawSku.sku_identifier)
    expect(back.identifiers).toEqual([{ type: 'upc', value: '012345678901' }])
  })
})
