/**
 * BASE item ↔ canonical Product/ProductVariant.
 * Docs: https://docs.thebase.in/api/ , https://docs.thebase.in/api/items ,
 * https://docs.thebase.in/api/items/add
 */
import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
  untransformProduct,
  type RawBaseEcItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/base-ec/transform/product'
import { ProductSchema, ProductVariantSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeItem(overrides: Partial<RawBaseEcItem> = {}): RawBaseEcItem {
  return {
    item_id: 1234,
    title: 'Tシャツ',
    detail: '<p>Soft cotton tee.</p>',
    price: 3900,
    proper_price: 4900,
    stock: 10,
    visible: 1,
    identifier: 'abcd-1234',
    modified: 1750000000,
    img1_origin: 'https://img.thebase.in/item/1234/1.jpg',
    ...overrides,
  }
}

describe('transformProduct (BASE)', () => {
  it('maps core item fields', () => {
    const result = transformProduct(makeItem())
    expect(result.id).toBe('1234')
    expect(result.title).toBe('Tシャツ')
    expect(result.description).toBe('<p>Soft cotton tee.</p>')
    expect(result.status).toBe('ACTIVE')
    expect(result.updatedAt).toBe(new Date(1750000000 * 1000).toISOString())
  })

  it('maps visible: 0 to DRAFT', () => {
    const result = transformProduct(makeItem({ visible: 0 }))
    expect(result.status).toBe('DRAFT')
  })

  it('collects imgN_origin fields into images, in position order', () => {
    const result = transformProduct(
      makeItem({ img1_origin: 'https://img/1.jpg', img3_origin: 'https://img/3.jpg' }),
    )
    expect(result.images).toEqual([
      { url: 'https://img/1.jpg', position: 0 },
      { url: 'https://img/3.jpg', position: 2 },
    ])
  })

  it('synthesises a default variant for items with no variations, marked synthetic', () => {
    const result = transformProduct(makeItem())
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('1234:default')
    expect(v.sku).toBe('abcd-1234')
    expect(v.price).toEqual({ amount: 3900, currency: 'JPY' })
    expect(v.compareAtPrice).toEqual({ amount: 4900, currency: 'JPY' })
    expect((v.metadata as { synthetic?: boolean }).synthetic).toBe(true)
    expect(() => ProductVariantSchema.parse(v)).not.toThrow()
  })

  it('maps real variations into variants, sharing the item price', () => {
    const item = makeItem({
      variations: [
        { variation_id: 11, variation: '黒/S', variation_stock: 4, variation_identifier: 'abcd-1234-bk-s' },
        { variation_id: 12, variation: '白/M', variation_stock: 6, barcode: '0123456789012' },
      ],
    })
    const result = transformProduct(item)
    expect(result.variants).toHaveLength(2)
    expect(result.variants![0]!.id).toBe('1234:11')
    expect(result.variants![0]!.productId).toBe('1234')
    expect(result.variants![0]!.title).toBe('黒/S')
    expect(result.variants![0]!.sku).toBe('abcd-1234-bk-s')
    expect(result.variants![0]!.price).toEqual({ amount: 3900, currency: 'JPY' })
    expect(result.variants![1]!.barcode).toBe('0123456789012')
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeItem()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies ProductSchema', () => {
    const result = transformProduct(
      makeItem({
        variations: [{ variation_id: 11, variation: '黒', variation_stock: 4 }],
      }),
    )
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('transformVariant (BASE) standalone', () => {
  it('builds a canonical variant from an item + variation', () => {
    const item = makeItem()
    const v = transformVariant(item, { variation_id: 99, variation: 'Red', variation_stock: 2 })
    expect(v.id).toBe('1234:99')
    expect(v.optionValues).toEqual({ variation: 'Red' })
    expect(() => ProductVariantSchema.parse(v)).not.toThrow()
  })
})

describe('untransformProduct (BASE)', () => {
  it('builds an items/add-shaped body for a simple product', () => {
    const body = untransformProduct({
      title: 'Tシャツ',
      description: '<p>Soft cotton tee.</p>',
      status: 'ACTIVE',
      variants: [
        {
          id: 'x:default',
          sku: 'abcd-1234',
          price: { amount: 3900, currency: 'JPY' },
          metadata: { stock: 10 },
        },
      ],
    })
    expect(body).toMatchObject({
      title: 'Tシャツ',
      detail: '<p>Soft cotton tee.</p>',
      price: 3900,
      visible: 1,
      identifier: 'abcd-1234',
      stock: 10,
    })
  })

  it('throws when the simple-product path has no metadata.stock, rather than inventing 0', () => {
    expect(() =>
      untransformProduct({
        title: 'T',
        variants: [{ id: 'x', price: { amount: 100, currency: 'JPY' }, metadata: {} }],
      }),
    ).toThrow(/requires an initial stock count/)
  })

  it('builds indexed variation arrays for a product with real variations', () => {
    const body = untransformProduct({
      title: 'Tシャツ',
      variants: [
        {
          id: 'x:11',
          title: '黒',
          sku: 'sku-blk',
          price: { amount: 3900, currency: 'JPY' },
          metadata: { stock: 4 },
        },
        {
          id: 'x:12',
          title: '白',
          barcode: '0123456789012',
          price: { amount: 3900, currency: 'JPY' },
          metadata: { stock: 6 },
        },
      ],
    }) as Record<string, unknown>
    expect(body.variation).toEqual(['黒', '白'])
    expect(body.variation_stock).toEqual([4, 6])
    expect(body.variation_identifier).toEqual(['sku-blk', undefined])
    expect(body.barcode).toEqual([undefined, '0123456789012'])
    expect(body.stock).toBeUndefined()
  })

  it('throws when a named variation has no metadata.stock', () => {
    expect(() =>
      untransformProduct({
        title: 'T',
        variants: [
          { id: 'x:11', title: 'Black', price: { amount: 100, currency: 'JPY' }, metadata: { stock: 1 } },
          { id: 'x:12', title: 'White', price: { amount: 100, currency: 'JPY' }, metadata: {} },
        ],
      }),
    ).toThrow(/requires an initial stock count/)
  })

  it('throws when a named variation has no title, rather than creating an unnamed one', () => {
    expect(() =>
      untransformProduct({
        title: 'T',
        variants: [
          { id: 'x:11', title: 'Black', price: { amount: 100, currency: 'JPY' }, metadata: { stock: 1 } },
          { id: 'x:12', price: { amount: 100, currency: 'JPY' }, metadata: { stock: 1 } },
        ],
      }),
    ).toThrow(/requires a `title` for variants\[1\]/)
  })

  it('throws when no variant carries a price', () => {
    expect(() => untransformProduct({ title: 'No price' })).toThrow(/requires at least one variant/)
  })
})
