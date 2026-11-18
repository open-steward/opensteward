import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformProductVariant,
  untransformProduct,
  untransformProductVariant,
  type RawWooCommerceProduct,
  type RawWooCommerceVariation,
} from '../../../../../../../src/verticals/ecommerce/adapters/wildberries/transform/product'
import {
  ProductSchema,
  ProductVariantSchema,
} from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeSimpleProduct(overrides: Partial<RawWooCommerceProduct> = {}): RawWooCommerceProduct {
  return {
    id: 42,
    name: 'Wireless Keyboard',
    slug: 'wireless-keyboard',
    type: 'simple',
    status: 'publish',
    price: '19.99',
    regular_price: '19.99',
    sku: 'WK-001',
    description: '<p>A great keyboard.</p>',
    date_created_gmt: '2024-01-01T00:00:00Z',
    date_modified_gmt: '2024-02-01T00:00:00Z',
    ...overrides,
  }
}

function makeVariableProduct(
  overrides: Partial<RawWooCommerceProduct> = {},
): RawWooCommerceProduct {
  return {
    id: 55,
    name: 'Color T-Shirt',
    slug: 'color-t-shirt',
    type: 'variable',
    status: 'publish',
    price: '',
    attributes: [{ id: 1, name: 'Color', options: ['Red', 'Blue'], variation: true }],
    variations: [
      {
        id: 101,
        sku: 'CT-RED',
        price: '14.99',
        regular_price: '14.99',
        attributes: [{ name: 'Color', option: 'Red' }],
      } as RawWooCommerceVariation,
    ],
    ...overrides,
  }
}

function makeVariation(overrides: Partial<RawWooCommerceVariation> = {}): RawWooCommerceVariation {
  return {
    id: 101,
    sku: 'CT-RED',
    price: '14.99',
    regular_price: '14.99',
    attributes: [{ name: 'Color', option: 'Red' }],
    ...overrides,
  }
}

describe('transformProduct (Wildberries/WooCommerce)', () => {
  it('maps core fields for a simple product', () => {
    const result = transformProduct(makeSimpleProduct())
    expect(result.id).toBe('42')
    expect(result.title).toBe('Wireless Keyboard')
    expect(result.handle).toBe('wireless-keyboard')
    expect(result.status).toBe('ACTIVE')
    expect(result.description).toBe('<p>A great keyboard.</p>')
  })

  it('synthesizes a default variant for simple products', () => {
    const result = transformProduct(makeSimpleProduct())
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('42:default')
    expect(v.productId).toBe('42')
    expect(v.price).toEqual({ amount: 1999, currency: 'USD' })
    expect(v.sku).toBe('WK-001')
  })

  it('maps status: draft → DRAFT, pending → ARCHIVED', () => {
    expect(transformProduct(makeSimpleProduct({ status: 'draft' })).status).toBe('DRAFT')
    expect(transformProduct(makeSimpleProduct({ status: 'pending' })).status).toBe('ARCHIVED')
  })

  it('maps variant objects for variable products', () => {
    const result = transformProduct(makeVariableProduct())
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('55:101')
    expect(v.sku).toBe('CT-RED')
    expect(v.price).toEqual({ amount: 1499, currency: 'USD' })
  })

  it('maps options from attributes', () => {
    const result = transformProduct(makeVariableProduct())
    expect(result.options).toHaveLength(1)
    expect(result.options![0]!.name).toBe('Color')
    expect(result.options![0]!.values).toEqual(['Red', 'Blue'])
  })

  it('sets compareAtPrice when sale_price is present', () => {
    const result = transformProduct(
      makeSimpleProduct({ price: '9.99', sale_price: '9.99', regular_price: '19.99' }),
    )
    const v = result.variants![0]!
    expect(v.compareAtPrice).toEqual({ amount: 1999, currency: 'USD' })
  })

  it('defaults weight unit to g when weight is set', () => {
    const result = transformProduct(makeSimpleProduct({ weight: '500' }))
    const v = result.variants![0]!
    expect(v.weightUnit).toBe('g')
    expect(v.weight).toBe(500)
  })

  it('maps tags and category to productType', () => {
    const result = transformProduct(
      makeSimpleProduct({
        tags: [{ name: 'keyboards' }],
        categories: [{ name: 'Electronics' }],
      }),
    )
    expect(result.tags).toEqual(['keyboards'])
    expect(result.productType).toBe('Electronics')
  })

  it('maps timestamps', () => {
    const result = transformProduct(makeSimpleProduct())
    expect(result.createdAt).toBe('2024-01-01T00:00:00Z')
    expect(result.updatedAt).toBe('2024-02-01T00:00:00Z')
  })

  it('produces a payload that satisfies ProductSchema', () => {
    expect(() => ProductSchema.parse(transformProduct(makeSimpleProduct()))).not.toThrow()
  })

  it('preserves raw in metadata', () => {
    const raw = makeSimpleProduct()
    expect(transformProduct(raw).metadata).toBe(raw)
  })
})

describe('transformProductVariant (Wildberries/WooCommerce)', () => {
  it('maps id as productId:variationId', () => {
    const result = transformProductVariant(makeVariation(), '55')
    expect(result.id).toBe('55:101')
    expect(result.productId).toBe('55')
  })

  it('maps price in minor units using provided currency', () => {
    const result = transformProductVariant(makeVariation(), '55', 'USD')
    expect(result.price).toEqual({ amount: 1499, currency: 'USD' })
  })

  it('sets compareAtPrice when sale differs from regular', () => {
    const result = transformProductVariant(
      makeVariation({ price: '9.99', sale_price: '9.99', regular_price: '14.99' }),
      '55',
      'USD',
    )
    expect(result.compareAtPrice).toEqual({ amount: 1499, currency: 'USD' })
  })

  it('maps optionValues from attributes', () => {
    const result = transformProductVariant(makeVariation(), '55')
    expect(result.optionValues).toEqual({ Color: 'Red' })
  })

  it('sets inventoryItemId to the variation id string', () => {
    const result = transformProductVariant(makeVariation(), '55')
    expect(result.inventoryItemId).toBe('101')
  })

  it('defaults taxable to true when tax_status is absent', () => {
    const result = transformProductVariant(makeVariation(), '55')
    expect(result.taxable).toBe(true)
  })

  it('produces a payload that satisfies ProductVariantSchema', () => {
    expect(() =>
      ProductVariantSchema.parse(transformProductVariant(makeVariation(), '55', 'USD')),
    ).not.toThrow()
  })
})

describe('untransformProduct (Wildberries/WooCommerce)', () => {
  it('maps title, description, handle, and status back to WC shape', () => {
    const result = untransformProduct({
      title: 'Test Product',
      description: 'desc',
      handle: 'test-product',
      status: 'ACTIVE',
    })
    expect(result.name).toBe('Test Product')
    expect(result.slug).toBe('test-product')
    expect(result.status).toBe('publish')
  })

  it('maps DRAFT status to draft', () => {
    const result = untransformProduct({ status: 'DRAFT' })
    expect(result.status).toBe('draft')
  })
})

describe('untransformProductVariant (Wildberries/WooCommerce)', () => {
  it('maps price from minor to major units', () => {
    const result = untransformProductVariant({
      sku: 'SKU1',
      price: { amount: 1999, currency: 'USD' },
    })
    expect(result.sku).toBe('SKU1')
    expect(result.regular_price).toBe('19.99')
  })

  it('maps optionValues to WC attributes array', () => {
    const result = untransformProductVariant({
      optionValues: { Color: 'Red', Size: 'M' },
    })
    const attrs = result.attributes as Array<{ name: string; option: string }>
    expect(attrs).toHaveLength(2)
    expect(attrs.find((a) => a.name === 'Color')?.option).toBe('Red')
  })
})
