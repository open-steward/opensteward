import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformProductVariant,
  untransformProduct,
  type RawMagentoProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/magento/transform/product'
import { ProductSchema, ProductVariantSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeConfigurable(
  overrides: Partial<RawMagentoProduct> = {},
): RawMagentoProduct {
  return {
    id: 101,
    sku: 'TEE-OCEAN',
    name: 'Ocean Blue T-Shirt',
    attribute_set_id: 4,
    price: 24.99,
    status: 1,
    visibility: 4,
    type_id: 'configurable',
    created_at: '2024-01-10T12:00:00.000Z',
    updated_at: '2024-02-01T09:00:00.000Z',
    weight: 180,
    extension_attributes: {
      configurable_product_options: [
        {
          id: 10,
          attribute_id: '93',
          label: 'Color',
          position: 0,
          values: [
            { value_index: 49, label: 'Blue' },
            { value_index: 50, label: 'Red' },
          ],
        },
        {
          id: 11,
          attribute_id: '137',
          label: 'Size',
          position: 1,
          values: [
            { value_index: 167, label: 'S' },
            { value_index: 168, label: 'M' },
          ],
        },
      ],
      configurable_product_links: [201, 202],
    },
    custom_attributes: [
      { attribute_code: 'description', value: '<p>A comfy tee.</p>' },
      { attribute_code: 'url_key', value: 'ocean-blue-t-shirt' },
    ],
    media_gallery_entries: [
      {
        id: 900,
        media_type: 'image',
        label: 'Front',
        position: 0,
        file: '/o/c/ocean-front.jpg',
        types: ['image'],
      },
    ],
    ...overrides,
  }
}

function makeChildSimple(
  overrides: Partial<RawMagentoProduct> = {},
): RawMagentoProduct {
  return {
    id: 201,
    sku: 'TEE-OCEAN-BLUE-S',
    name: 'Ocean Blue T-Shirt - Blue / S',
    price: 24.99,
    status: 1,
    type_id: 'simple',
    weight: 180,
    custom_attributes: [
      { attribute_code: 'attribute_93', value: '49' },
      { attribute_code: 'attribute_137', value: '167' },
    ],
    extension_attributes: {
      stock_item: { qty: 17, is_in_stock: true },
    },
    ...overrides,
  }
}

describe('transformProduct (Magento)', () => {
  it('maps core fields for a configurable parent', () => {
    const result = transformProduct(makeConfigurable())
    expect(result.id).toBe('TEE-OCEAN')
    expect(typeof result.id).toBe('string')
    expect(result.title).toBe('Ocean Blue T-Shirt')
    expect(result.description).toBe('<p>A comfy tee.</p>')
    expect(result.handle).toBe('ocean-blue-t-shirt')
    expect(result.status).toBe('ACTIVE')
    expect(result.productType).toBe('configurable')
  })

  it('builds options from configurable_product_options', () => {
    const result = transformProduct(makeConfigurable())
    expect(result.options).toHaveLength(2)
    expect(result.options![0]).toMatchObject({
      name: 'Color',
      values: ['Blue', 'Red'],
    })
    expect(result.options![1]!.name).toBe('Size')
  })

  it('maps children into composite-id variants with option values', () => {
    const parent = makeConfigurable()
    const child = makeChildSimple()
    const result = transformProduct(parent, [child])
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('TEE-OCEAN:TEE-OCEAN-BLUE-S')
    expect(v.productId).toBe('TEE-OCEAN')
    expect(v.sku).toBe('TEE-OCEAN-BLUE-S')
    expect(v.price).toEqual({ amount: 2499, currency: 'USD' })
    // Selected values are resolved from parent option labels.
    expect(v.optionValues).toEqual({ Color: 'Blue', Size: 'S' })
    expect((v.metadata as { parentSku?: string }).parentSku).toBe('TEE-OCEAN')
  })

  it('synthesises a default variant for simple products', () => {
    const simple = makeConfigurable({
      sku: 'SIMPLE-1',
      type_id: 'simple',
      price: 9.99,
      extension_attributes: { stock_item: { qty: 5 } },
    })
    const result = transformProduct(simple)
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('SIMPLE-1:default')
    expect(v.sku).toBe('SIMPLE-1')
    expect(v.price).toEqual({ amount: 999, currency: 'USD' })
    expect((v.metadata as { synthetic?: boolean }).synthetic).toBe(true)
    expect(() => ProductVariantSchema.parse(v)).not.toThrow()
  })

  it('preserves the raw payload in metadata unmodified', () => {
    const raw = makeConfigurable()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies ProductSchema', () => {
    const result = transformProduct(makeConfigurable(), [makeChildSimple()])
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformProduct', () => {
    const canonical = transformProduct(makeConfigurable({ type_id: 'simple' }))
    const body = untransformProduct(canonical) as { product: Record<string, unknown> }
    expect(body.product['sku']).toBe('TEE-OCEAN')
    expect(body.product['name']).toBe('Ocean Blue T-Shirt')
    expect(body.product['status']).toBe(1)
    const attrs = body.product['custom_attributes'] as Array<{
      attribute_code: string
      value: unknown
    }>
    expect(attrs.find((a) => a.attribute_code === 'url_key')?.value).toBe(
      'ocean-blue-t-shirt',
    )
  })
})

describe('transformProductVariant (Magento) standalone', () => {
  it('builds a composite-id canonical variant from a child simple product', () => {
    const v = transformProductVariant(makeChildSimple(), 'TEE-OCEAN', makeConfigurable())
    expect(v.id).toBe('TEE-OCEAN:TEE-OCEAN-BLUE-S')
    expect(v.inventoryItemId).toBe('TEE-OCEAN-BLUE-S')
    expect(v.weight).toBe(180)
    expect(v.weightUnit).toBe('g')
  })
})
