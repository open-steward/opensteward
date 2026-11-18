import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariantItem,
  untransformProduct,
  type RawEverShopProduct,
  type RawEverShopVariantItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/evershop/transform/product'
import {
  ProductSchema,
  ProductVariantSchema,
} from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeVariantItem(overrides: Partial<RawEverShopVariantItem> = {}): RawEverShopVariantItem {
  return {
    id: 5,
    product: {
      product_id: 20,
      uuid: 'var-uuid-evershop-1',
      name: 'Red Shoe Size 42',
      sku: 'SHOE-RED-42',
      price: 49.99,
      weight: 0.8,
      status: 1,
    },
    attributes: [
      { attribute_id: 1, attribute_code: 'color', option_id: 10, option_text: 'Red' },
      { attribute_id: 2, attribute_code: 'size', option_id: 20, option_text: '42' },
    ],
    ...overrides,
  }
}

function makeProduct(overrides: Partial<RawEverShopProduct> = {}): RawEverShopProduct {
  return {
    product_id: 15,
    uuid: 'prod-uuid-evershop-1',
    name: 'Running Shoe',
    sku: 'SHOE-BASE',
    price: 49.99,
    short_description: 'Lightweight shoe',
    description: '<p>A great running shoe</p>',
    url_key: 'running-shoe',
    status: 1,
    weight: 0.8,
    image: 'https://example.com/shoe.jpg',
    variants: [makeVariantItem()],
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformVariantItem (EverShop)', () => {
  it('uses variant product uuid as id', () => {
    const result = transformVariantItem(makeVariantItem(), 'prod-uuid-evershop-1', 'USD')
    expect(result!.id).toBe('var-uuid-evershop-1')
  })

  it('falls back to string product_id when uuid absent on variant product', () => {
    const item = makeVariantItem()
    item.product = { ...item.product!, uuid: undefined }
    const result = transformVariantItem(item, 'prod-uuid-evershop-1', 'USD')
    expect(result!.id).toBe('20')
  })

  it('returns undefined when product is absent', () => {
    const item = makeVariantItem({ product: undefined })
    const result = transformVariantItem(item, 'prod-uuid-evershop-1', 'USD')
    expect(result).toBeUndefined()
  })

  it('maps parentId to productId', () => {
    const result = transformVariantItem(makeVariantItem(), 'prod-uuid-evershop-1', 'USD')
    expect(result!.productId).toBe('prod-uuid-evershop-1')
  })

  it('maps sku from variant product', () => {
    const result = transformVariantItem(makeVariantItem(), 'prod-uuid-evershop-1', 'USD')
    expect(result!.sku).toBe('SHOE-RED-42')
  })

  it('converts price from USD major to minor units', () => {
    const result = transformVariantItem(makeVariantItem(), 'prod-uuid-evershop-1', 'USD')
    expect(result!.price).toEqual({ amount: 4999, currency: 'USD' })
  })

  it('builds optionValues from attributes', () => {
    const result = transformVariantItem(makeVariantItem(), 'prod-uuid-evershop-1', 'USD')
    expect(result!.optionValues).toEqual({ color: 'Red', size: '42' })
  })

  it('maps weightUnit to "kg"', () => {
    const result = transformVariantItem(makeVariantItem(), 'prod-uuid-evershop-1', 'USD')
    expect(result!.weightUnit).toBe('kg')
  })

  it('produces a payload satisfying ProductVariantSchema', () => {
    const result = transformVariantItem(makeVariantItem(), 'prod-uuid-evershop-1', 'USD')
    expect(() => ProductVariantSchema.parse(result!)).not.toThrow()
  })
})

describe('transformProduct (EverShop)', () => {
  it('uses uuid as id when available', () => {
    const result = transformProduct(makeProduct({ uuid: 'prod-uuid-evershop-1' }))
    expect(result.id).toBe('prod-uuid-evershop-1')
  })

  it('falls back to string product_id when uuid is absent', () => {
    const result = transformProduct(makeProduct({ uuid: undefined }))
    expect(result.id).toBe('15')
  })

  it('maps name to title', () => {
    const result = transformProduct(makeProduct())
    expect(result.title).toBe('Running Shoe')
  })

  it('maps description (prefers description over short_description)', () => {
    const result = transformProduct(makeProduct())
    expect(result.description).toBe('<p>A great running shoe</p>')
  })

  it('falls back to short_description when description is absent', () => {
    const result = transformProduct(makeProduct({ description: null }))
    expect(result.description).toBe('Lightweight shoe')
  })

  it('maps url_key to handle', () => {
    const result = transformProduct(makeProduct())
    expect(result.handle).toBe('running-shoe')
  })

  it('maps status 1 to ACTIVE', () => {
    const result = transformProduct(makeProduct({ status: 1 }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps status 0 to ARCHIVED', () => {
    const result = transformProduct(makeProduct({ status: 0 }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps boolean status true to ACTIVE', () => {
    const result = transformProduct(makeProduct({ status: true }))
    expect(result.status).toBe('ACTIVE')
  })

  it('builds image from image path', () => {
    const result = transformProduct(makeProduct({ image: 'https://example.com/shoe.jpg' }))
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://example.com/shoe.jpg')
  })

  it('maps variants from variant items', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.sku).toBe('SHOE-RED-42')
  })

  it('synthesizes a default variant when no variant items provided', () => {
    const result = transformProduct(makeProduct({ variants: [] }))
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.id).toBe('prod-uuid-evershop-1:default')
    expect(result.variants![0]!.sku).toBe('SHOE-BASE')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying ProductSchema', () => {
    const result = transformProduct(makeProduct())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('untransformProduct (EverShop)', () => {
  it('maps title to name', () => {
    const body = untransformProduct({ title: 'Trail Shoe' })
    expect(body['name']).toBe('Trail Shoe')
  })

  it('maps ACTIVE status to 1', () => {
    const body = untransformProduct({ status: 'ACTIVE' })
    expect(body['status']).toBe(1)
  })

  it('maps DRAFT status to 0', () => {
    const body = untransformProduct({ status: 'DRAFT' })
    expect(body['status']).toBe(0)
  })

  it('maps handle to url_key', () => {
    const body = untransformProduct({ handle: 'trail-shoe' })
    expect(body['url_key']).toBe('trail-shoe')
  })

  it('extracts price from first variant in minor units / 100', () => {
    const body = untransformProduct({
      variants: [{ id: 'v1', price: { amount: 4999, currency: 'USD' }, metadata: {} }],
    })
    expect(body['price']).toBe(49.99)
  })
})
