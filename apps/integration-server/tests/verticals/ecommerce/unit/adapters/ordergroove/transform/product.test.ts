/**
 * Ordergroove Product → canonical Product.
 *
 * Raw shape confirmed verbatim at
 * https://developer.ordergroove.com/reference/products-list and
 * https://developer.ordergroove.com/reference/products-retrieve.
 */
import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  type RawOrdergrooveProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/ordergroove/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawOrdergrooveProduct> = {}): RawOrdergrooveProduct {
  return {
    merchant: '519f1f120e3411ef984b1e8a267ce85a',
    groups: [{ name: 'subscription', group_type: 'eligibility' }],
    name: 'Medium Roast Coffee Bag',
    price: '10.00',
    image_url: 'https://cdn.example.com/coffee.jpg',
    detail_url: 'https://shop.example.com/products/coffee',
    external_product_id: '48398751432995',
    sku: '48398751432995',
    autoship_enabled: true,
    created: '2024-05-09 15:20:09',
    last_update: '2024-05-13 08:56:36',
    live: true,
    discontinued: false,
    product_type: 'standard',
    autoship_by_default: true,
    ...overrides,
  }
}

describe('ordergroove transformProduct', () => {
  it('maps external_product_id as the canonical id', () => {
    expect(transformProduct(makeProduct()).id).toBe('48398751432995')
  })

  it('maps name to title and product_type to productType', () => {
    const result = transformProduct(makeProduct())
    expect(result.title).toBe('Medium Roast Coffee Bag')
    expect(result.productType).toBe('standard')
  })

  it('maps live+discontinued to ACTIVE / ARCHIVED / DRAFT status', () => {
    expect(transformProduct(makeProduct({ live: true, discontinued: false })).status).toBe('ACTIVE')
    expect(transformProduct(makeProduct({ discontinued: true })).status).toBe('ARCHIVED')
    expect(transformProduct(makeProduct({ live: false, discontinued: false })).status).toBe('DRAFT')
  })

  it('maps groups to tags', () => {
    expect(transformProduct(makeProduct()).tags).toEqual(['subscription'])
  })

  it('omits tags when there are no groups', () => {
    expect(transformProduct(makeProduct({ groups: [] })).tags).toBeUndefined()
  })

  it('maps image_url to a single image', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://cdn.example.com/coffee.jpg')
  })

  it('converts the space-separated created/last_update timestamps to ISO 8601 UTC', () => {
    const result = transformProduct(makeProduct())
    expect(result.createdAt).toBe('2024-05-09T15:20:09.000Z')
    expect(result.updatedAt).toBe('2024-05-13T08:56:36.000Z')
  })

  it('never sets a product-level price — Ordergroove has no variant to hold it', () => {
    expect(transformProduct(makeProduct()).variants).toBeUndefined()
  })

  it('preserves the raw payload in metadata and produces a schema-valid result', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('untransformProduct only emits documented PATCH fields, read from metadata', () => {
    const canonical = transformProduct(makeProduct())
    // A fresh metadata object with exactly the fields under test — NOT spread
    // from `canonical.metadata`, which is the raw fixture and already
    // carries its own `autoship_by_default: true`. Spreading it in here
    // would silently reintroduce that field and defeat the "only emits
    // documented PATCH fields [supplied here]" premise of this test.
    canonical.metadata = {
      autoship_enabled: false,
      price: 12.5,
      type: 'standard',
    }
    const body = untransformProduct(canonical)
    expect(body).toEqual({ autoship_enabled: false, price: 12.5, type: 'standard' })
  })

  it('untransformProduct returns an empty body when metadata carries no writable fields', () => {
    expect(untransformProduct({ title: 'New name' })).toEqual({})
  })
})
