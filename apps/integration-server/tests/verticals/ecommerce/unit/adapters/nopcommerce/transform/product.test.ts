import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformProductVariant,
  untransformProduct,
  untransformProductVariant,
  parseAttributesXml,
  type RawNopProduct,
  type RawNopAttributeCombination,
  type RawNopProductAttributeMapping,
} from '../../../../../../../src/verticals/ecommerce/adapters/nopcommerce/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeCombination(
  overrides: Partial<RawNopAttributeCombination> = {},
): RawNopAttributeCombination {
  return {
    id: 501,
    product_id: 100,
    sku: 'TEE-S-BLUE',
    stock_quantity: 17,
    allow_out_of_stock_orders: false,
    overridden_price: 19.99,
    gtin: '1234567890123',
    attributes_xml:
      '<Attributes><ProductAttribute ID="10"><ProductAttributeValue><Value>20</Value></ProductAttributeValue></ProductAttribute></Attributes>',
    ...overrides,
  }
}

function makeMappings(): RawNopProductAttributeMapping[] {
  return [
    {
      id: 10,
      product_attribute_name: 'Size',
      attribute_values: [
        { id: 20, name: 'Small' },
        { id: 21, name: 'Medium' },
      ],
    },
    {
      id: 11,
      product_attribute_name: 'Color',
      attribute_values: [
        { id: 30, name: 'Blue' },
        { id: 31, name: 'Red' },
      ],
    },
  ]
}

function makeProduct(overrides: Partial<RawNopProduct> = {}): RawNopProduct {
  return {
    id: 100,
    name: 'Ocean Blue T-Shirt',
    se_name: 'ocean-blue-t-shirt',
    full_description: '<p>A comfy tee.</p>',
    short_description: 'Comfy tee',
    published: true,
    deleted: false,
    price: 24.99,
    old_price: 29.99,
    sku: 'TEE-OCEAN',
    weight: 180,
    tags: ['cotton', 'summer'],
    product_attribute_mappings: makeMappings(),
    product_attribute_combinations: [makeCombination()],
    images: [
      {
        id: 900,
        src: 'https://cdn.example.com/img/001.jpg',
        alt: 'Front',
        position: 0,
      },
    ],
    created_on_utc: '2024-01-10T12:00:00Z',
    updated_on_utc: '2024-02-01T09:00:00Z',
    ...overrides,
  }
}

describe('transformProduct (nopCommerce)', () => {
  it('maps core fields and stringifies ids', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.id).toBe('100')
    expect(typeof result.id).toBe('string')
    expect(result.title).toBe('Ocean Blue T-Shirt')
    expect(result.handle).toBe('ocean-blue-t-shirt')
    expect(result.description).toBe('<p>A comfy tee.</p>')
    expect(result.status).toBe('ACTIVE')
  })

  it('maps tags from array', () => {
    const result = transformProduct(makeProduct())
    expect(result.tags).toEqual(['cotton', 'summer'])
  })

  it('maps tags from comma-separated string', () => {
    const result = transformProduct(makeProduct({ tags: 'cotton, summer' }))
    expect(result.tags).toEqual(['cotton', 'summer'])
  })

  it('maps options from product attribute mappings', () => {
    const result = transformProduct(makeProduct())
    expect(result.options).toHaveLength(2)
    expect(result.options![0]).toMatchObject({ name: 'Size', values: ['Small', 'Medium'] })
    expect(result.options![1]).toMatchObject({ name: 'Color', values: ['Blue', 'Red'] })
  })

  it('maps attribute combinations as variants with composite ids', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('100:501')
    expect(v.productId).toBe('100')
    expect(v.sku).toBe('TEE-S-BLUE')
    expect(v.barcode).toBe('1234567890123')
    expect(v.price).toEqual({ amount: 1999, currency: 'USD' })
    expect((v.metadata as { parentProductId?: string }).parentProductId).toBe('100')
  })

  it('uses base product price when combination has no overridden_price', () => {
    const combo = makeCombination({ overridden_price: null })
    const result = transformProduct(makeProduct({ product_attribute_combinations: [combo] }))
    const v = result.variants![0]!
    expect(v.price).toEqual({ amount: 2499, currency: 'USD' })
  })

  it('synthesises a default variant for products without combinations', () => {
    const simple = makeProduct({ product_attribute_combinations: [], sku: 'SIMPLE-1' })
    const result = transformProduct(simple)
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('100:default')
    expect(v.sku).toBe('SIMPLE-1')
    expect(v.price).toEqual({ amount: 2499, currency: 'USD' })
    expect(v.compareAtPrice).toEqual({ amount: 2999, currency: 'USD' })
    expect((v.metadata as { synthetic?: boolean }).synthetic).toBe(true)
  })

  it('maps draft status correctly', () => {
    const result = transformProduct(makeProduct({ published: false, deleted: false }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps deleted/archived status correctly', () => {
    const result = transformProduct(makeProduct({ deleted: true }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies ProductSchema', () => {
    const result = transformProduct(makeProduct())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformProduct', () => {
    const canonical = transformProduct(makeProduct({ product_attribute_combinations: [] }))
    const body = untransformProduct(canonical)
    expect(body['name']).toBe('Ocean Blue T-Shirt')
    expect(body['full_description']).toBe('<p>A comfy tee.</p>')
    expect(body['se_name']).toBe('ocean-blue-t-shirt')
    expect(body['published']).toBe(true)
  })
})

describe('transformProductVariant (nopCommerce) standalone', () => {
  it('builds a canonical variant from an attribute combination', () => {
    const v = transformProductVariant(makeCombination(), '100', 24.99)
    expect(v.id).toBe('100:501')
    expect(v.inventoryItemId).toBe('501')
    expect(v.sku).toBe('TEE-S-BLUE')
    expect(v.barcode).toBe('1234567890123')
    expect(v.price).toEqual({ amount: 1999, currency: 'USD' })
  })
})

describe('untransformProductVariant (nopCommerce)', () => {
  it('converts canonical variant to nopCommerce body', () => {
    const body = untransformProductVariant({
      sku: 'SKU-1',
      barcode: '9876',
      price: { amount: 15.0, currency: 'USD' },
    })
    expect(body['sku']).toBe('SKU-1')
    expect(body['gtin']).toBe('9876')
    expect(body['overridden_price']).toBe(15.0)
  })
})

describe('parseAttributesXml', () => {
  it('extracts attribute values from XML', () => {
    const xml =
      '<Attributes><ProductAttribute ID="10"><ProductAttributeValue><Value>20</Value></ProductAttributeValue></ProductAttribute></Attributes>'
    const result = parseAttributesXml(xml, makeMappings())
    expect(result).toEqual({ Size: 'Small' })
  })

  it('returns undefined for empty XML', () => {
    expect(parseAttributesXml('', makeMappings())).toBeUndefined()
    expect(parseAttributesXml(undefined, makeMappings())).toBeUndefined()
  })

  it('returns undefined for missing mappings', () => {
    const xml = '<Attributes><ProductAttribute ID="10"><ProductAttributeValue><Value>20</Value></ProductAttributeValue></ProductAttribute></Attributes>'
    expect(parseAttributesXml(xml, undefined)).toBeUndefined()
    expect(parseAttributesXml(xml, [])).toBeUndefined()
  })
})
