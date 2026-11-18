/**
 * Orderchamp Product/ProductVariant transforms.
 * Docs: https://developers.orderchamp.com/manage-products
 *       https://developers.orderchamp.com/manage-inventory
 */
import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
  untransformProduct,
  untransformVariant,
  type RawOrderchampProduct,
  type RawOrderchampVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/orderchamp/transform/product'
import { ProductSchema, ProductVariantSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeVariant(overrides: Partial<RawOrderchampVariant> = {}): RawOrderchampVariant {
  return {
    id: 'variant-1',
    title: 'Red / M',
    sku: 'SKU-RED-M',
    price: { amount: '19.99', currencyCode: 'EUR' },
    inventoryQuantity: 15,
    ...overrides,
  }
}

function makeProduct(overrides: Partial<RawOrderchampProduct> = {}): RawOrderchampProduct {
  return {
    id: 'product-1',
    title: 'Ceramic Mug',
    variants: { edges: [{ node: makeVariant() }] },
    ...overrides,
  }
}

describe('transformVariant (Orderchamp)', () => {
  it('maps id/sku/title/price', () => {
    const result = transformVariant(makeVariant(), 'product-1')
    expect(result.id).toBe('variant-1')
    expect(result.productId).toBe('product-1')
    expect(result.sku).toBe('SKU-RED-M')
    expect(result.title).toBe('Red / M')
    expect(result.price).toEqual({ amount: 1999, currency: 'EUR' })
  })

  it('throws rather than inventing a price when none is reported', () => {
    expect(() => transformVariant(makeVariant({ price: null }), 'product-1')).toThrow(/no usable price/)
  })

  it('produces schema-valid output', () => {
    expect(() => ProductVariantSchema.parse(transformVariant(makeVariant(), 'product-1'))).not.toThrow()
  })
})

describe('transformProduct (Orderchamp)', () => {
  it('maps id/title and nested variants', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('product-1')
    expect(result.title).toBe('Ceramic Mug')
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.id).toBe('variant-1')
  })

  it('omits variants when there are none', () => {
    expect(transformProduct(makeProduct({ variants: { edges: [] } })).variants).toBeUndefined()
  })

  it('preserves raw in metadata', () => {
    const raw = makeProduct()
    expect(transformProduct(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    expect(() => ProductSchema.parse(transformProduct(makeProduct()))).not.toThrow()
  })
})

describe('untransformProduct (Orderchamp)', () => {
  it('maps title and externalProductId', () => {
    const input = untransformProduct({ title: 'Ceramic Mug', metadata: { externalProductId: 'ext-1' } })
    expect(input.title).toBe('Ceramic Mug')
    expect(input.externalProductId).toBe('ext-1')
  })

  it('never fabricates a category/image field name — a caller must supply metadata.raw for those', () => {
    const input = untransformProduct({ title: 'x' })
    expect(input).not.toHaveProperty('categoryId')
    expect(input).not.toHaveProperty('category')
    expect(input).not.toHaveProperty('images')
  })

  it('merges metadata.raw last, letting a knowledgeable caller supply unconfirmed fields', () => {
    const input = untransformProduct({ title: 'x', metadata: { raw: { categoryPath: ['Home', 'Kitchen'] } } })
    expect(input.categoryPath).toEqual(['Home', 'Kitchen'])
    expect(input.title).toBe('x')
  })
})

describe('untransformVariant (Orderchamp)', () => {
  it('maps sku, price (major units), and color/size/option from metadata', () => {
    const input = untransformVariant({
      sku: 'SKU-1',
      price: { amount: 1999, currency: 'EUR' },
      metadata: { color: 'Red', size: 'M' },
    })
    expect(input.sku).toBe('SKU-1')
    expect(input.price).toEqual({ amount: 19.99, currencyCode: 'EUR' })
    expect(input.color).toBe('Red')
    expect(input.size).toBe('M')
  })

  it('includes productVariantId/productId when id/productId are set', () => {
    const input = untransformVariant({ id: 'v1', productId: 'p1', sku: 'SKU-1' })
    expect(input.productVariantId).toBe('v1')
    expect(input.productId).toBe('p1')
  })
})

describe('transformProduct (orderchamp): no invented title', () => {
  it('throws rather than giving a product with no title an empty one', () => {
    expect(() => transformProduct({ ...makeProduct(), title: undefined } as ReturnType<typeof makeProduct>)).toThrow(/no title/)
  })
})
