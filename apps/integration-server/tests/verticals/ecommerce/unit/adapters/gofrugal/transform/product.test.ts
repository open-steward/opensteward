/**
 * GOFRUGAL Item → canonical Product transform tests.
 *
 * Raw shape per https://community.gofrugal.com/portal/en/kb/gofrugalretaileasy/ecommerce-integration/api-integration/articles/list-all-items
 * (`{ items: [{ itemId, itemName, locationId, stock: [{ stock, salePrice, mrp, itemReferenceCode, taxPercentage }] }] }`).
 *
 * GOFRUGAL reports no currency of its own — `currency` is always the
 * caller-supplied, connection-level value (see ../client.ts), so these
 * tests deliberately use a non-INR currency (AED) to pin that nothing here
 * is hardcoded to India.
 */
import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawGofrugalItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/gofrugal/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeItem(overrides: Partial<RawGofrugalItem> = {}): RawGofrugalItem {
  return {
    itemId: 1,
    itemName: 'bat',
    locationId: 225,
    stock: [{ stock: 7, salePrice: 120, mrp: 130, itemReferenceCode: '', taxPercentage: 12 }],
    ...overrides,
  }
}

describe('GOFRUGAL transform/product', () => {
  it('maps a documented item and survives ProductSchema.parse', () => {
    const product = transformProduct(makeItem(), 'AED')
    expect(ProductSchema.parse(product)).toBeTruthy()
    expect(product.id).toBe('1')
    expect(product.title).toBe('bat')
  })

  it('prices the variant in the currency passed in — never a hardcoded default', () => {
    const product = transformProduct(makeItem(), 'AED')
    ProductSchema.parse(product)
    expect(product.variants).toHaveLength(1)
    expect(product.variants![0]!.price).toEqual({ amount: 12000, currency: 'AED' })
    expect(product.variants![0]!.compareAtPrice).toEqual({ amount: 13000, currency: 'AED' })
  })

  it('uses whatever currency the connection reports, e.g. INR for an Indian deployment', () => {
    const product = transformProduct(makeItem(), 'INR')
    expect(product.variants![0]!.price).toEqual({ amount: 12000, currency: 'INR' })
  })

  it('drops an empty itemReferenceCode rather than emitting an empty sku', () => {
    const product = transformProduct(makeItem(), 'AED')
    expect(product.variants![0]!.sku).toBeUndefined()
  })

  it('keeps a non-empty itemReferenceCode as sku', () => {
    const product = transformProduct(
      makeItem({ stock: [{ stock: 1, salePrice: 10, itemReferenceCode: 'BAT-001' }] }),
      'AED',
    )
    expect(product.variants![0]!.sku).toBe('BAT-001')
  })

  it('omits variants entirely when there is no stock/price row', () => {
    const product = transformProduct(makeItem({ stock: [] }), 'AED')
    expect(ProductSchema.parse(product)).toBeTruthy()
    expect(product.variants).toBeUndefined()
  })

  it('preserves the complete raw payload in metadata', () => {
    const raw = makeItem()
    const product = transformProduct(raw, 'AED')
    expect(product.metadata).toEqual(raw)
  })
})
