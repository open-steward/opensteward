/**
 * Virto Commerce CatalogProduct → canonical Product/ProductVariant.
 *
 * Field shapes verified against the live demo instance's
 * VirtoCommerce.Catalog/swagger.json `components.schemas.CatalogProduct`
 * (fetched 2026-09-13): id, code, name, productType, categoryId, vendor,
 * isActive, weight, weightUnit, images[], variations[], createdDate,
 * modifiedDate.
 *
 * Virto's Catalog module carries no price on `CatalogProduct` — prices are
 * a separate Pricing-module concept (`GET /api/products/{id}/prices`,
 * `Price { list, sale, currency }`). Since canonical `ProductVariant.price`
 * is required and there is no honest default, `transformVariant` requires a
 * resolved `Money` from the caller, and `transformProduct` omits any
 * variation it has no resolved price for rather than fabricate one.
 */
import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
  untransformProduct,
  type RawVirtoCatalogProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/virto-commerce/transform/product'
import { ProductSchema, ProductVariantSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawVirtoCatalogProduct> = {}): RawVirtoCatalogProduct {
  return {
    id: 'prod-1',
    code: 'WK-2026',
    name: 'Wireless Keyboard',
    productType: 'Physical',
    categoryId: 'cat-accessories',
    vendor: 'Acme',
    isActive: true,
    weight: 0.85,
    weightUnit: 'kg',
    images: [{ url: 'https://cdn.example.com/wk.jpg', sortOrder: 0 }],
    createdDate: '2026-01-15T09:30:00Z',
    modifiedDate: '2026-02-01T14:20:00Z',
    ...overrides,
  }
}

describe('transformProduct (virto-commerce)', () => {
  it('maps core fields', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('prod-1')
    expect(result.title).toBe('Wireless Keyboard')
    expect(result.vendor).toBe('Acme')
    expect(result.productType).toBe('Physical')
  })

  it('maps images', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toEqual([{ url: 'https://cdn.example.com/wk.jpg', position: 0 }])
  })

  it('maps createdAt/updatedAt', () => {
    const result = transformProduct(makeProduct())
    expect(result.createdAt).toBe('2026-01-15T09:30:00Z')
    expect(result.updatedAt).toBe('2026-02-01T14:20:00Z')
  })

  it('does not synthesize a handle from a code that is not slug-safe', () => {
    const result = transformProduct(makeProduct({ code: 'WK_2026 v2' }))
    expect(result.handle).toBeUndefined()
  })

  it('omits a variation entirely when the caller has no resolved price for it', () => {
    const raw = makeProduct({
      variations: [
        { id: 'var-1', code: 'WK-2026-BLK', name: 'Black', mainProductId: 'prod-1' },
      ],
    })
    const result = transformProduct(raw)
    expect(result.variants).toBeUndefined()
  })

  it('includes only the variations the price map resolves, never fabricating the rest', () => {
    const raw = makeProduct({
      variations: [
        { id: 'var-1', code: 'WK-2026-BLK', name: 'Black', mainProductId: 'prod-1' },
        { id: 'var-2', code: 'WK-2026-WHT', name: 'White', mainProductId: 'prod-1' },
      ],
    })
    const result = transformProduct(raw, { 'var-1': { amount: 2999, currency: 'USD' } })
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.id).toBe('var-1')
    expect(result.variants![0]!.price).toEqual({ amount: 2999, currency: 'USD' })
  })

  it('leaves status unset when isActive is not reported, rather than assuming ACTIVE', () => {
    const result = transformProduct(makeProduct({ isActive: undefined }))
    expect(result.status).toBeUndefined()
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeProduct()
    expect(transformProduct(raw).metadata).toEqual(raw)
  })

  it('satisfies ProductSchema, with and without variations', () => {
    expect(() => ProductSchema.parse(transformProduct(makeProduct()))).not.toThrow()
    expect(() =>
      ProductSchema.parse(
        transformProduct(makeProduct({ variations: [{ id: 'v1', name: 'X', mainProductId: 'prod-1' }] })),
      ),
    ).not.toThrow()
  })

  it('round-trips writable fields via untransformProduct', () => {
    const canonical = transformProduct(makeProduct())
    const raw = untransformProduct(canonical)
    expect(raw['name']).toBe('Wireless Keyboard')
    expect(raw['vendor']).toBe('Acme')
  })
})

describe('transformVariant (virto-commerce)', () => {
  it('satisfies ProductVariantSchema given a resolved price', () => {
    const raw: RawVirtoCatalogProduct = { id: 'v1', name: 'Black', mainProductId: 'p1' }
    const price = { amount: 1999, currency: 'USD' }
    expect(() => ProductVariantSchema.parse(transformVariant(raw, price))).not.toThrow()
  })
})
