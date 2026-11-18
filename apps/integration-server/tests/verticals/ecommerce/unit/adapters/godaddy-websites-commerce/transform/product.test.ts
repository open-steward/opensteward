import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
  untransformProduct,
  type RawShopifyProduct,
  type RawShopifyVariant,
  type RawShopifyOption,
} from '../../../../../../../src/verticals/ecommerce/adapters/godaddy-websites-commerce/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeVariant(overrides: Partial<RawShopifyVariant> = {}): RawShopifyVariant {
  return {
    id: 1111,
    product_id: 500,
    title: 'Red / M',
    price: '29.99',
    sku: 'SHIRT-R-M',
    weight: 0.3,
    weight_unit: 'kg',
    inventory_item_id: 9999,
    taxable: true,
    requires_shipping: true,
    position: 1,
    option1: 'Red',
    option2: 'M',
    ...overrides,
  }
}

function makeProduct(overrides: Partial<RawShopifyProduct> = {}): RawShopifyProduct {
  return {
    id: 500,
    title: 'Classic Shirt',
    body_html: '<p>A timeless shirt.</p>',
    handle: 'classic-shirt',
    status: 'active',
    vendor: 'Acme Apparel',
    product_type: 'Tops',
    tags: 'shirt, classic',
    options: [
      { id: 10, name: 'Color', position: 1, values: ['Red', 'Blue'] },
      { id: 11, name: 'Size', position: 2, values: ['S', 'M', 'L'] },
    ],
    variants: [makeVariant()],
    images: [
      {
        id: 777,
        product_id: 500,
        position: 1,
        src: 'https://cdn.example.com/shirt.jpg',
        alt: 'Classic Shirt',
      },
    ],
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-10T00:00:00Z',
    published_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformProduct (GoDaddy Websites + Commerce / Shopify shapes)', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('500')
    expect(result.title).toBe('Classic Shirt')
    expect(result.vendor).toBe('Acme Apparel')
    expect(result.status).toBe('ACTIVE')
  })

  it('splits tags string', () => {
    const result = transformProduct(makeProduct())
    expect(result.tags).toEqual(['shirt', 'classic'])
  })

  it('maps variants with optionValues', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('1111')
    expect(v.price).toEqual({ amount: 2999, currency: 'USD' })
    expect(v.optionValues).toEqual({ Color: 'Red', Size: 'M' })
    expect(v.weightUnit).toBe('kg')
  })

  it('maps images', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://cdn.example.com/shirt.jpg')
  })

  it('maps product options', () => {
    const result = transformProduct(makeProduct())
    expect(result.options).toHaveLength(2)
    expect(result.options![0]!.name).toBe('Color')
    expect(result.options![0]!.values).toEqual(['Red', 'Blue'])
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

  it('round-trips via untransformProduct', () => {
    const canonical = transformProduct(makeProduct())
    const back = untransformProduct(canonical)
    expect(back.title).toBe('Classic Shirt')
    expect(back.status).toBe('active')
  })
})

describe('transformVariant (GoDaddy Websites + Commerce / Shopify shapes)', () => {
  it('maps standalone variant with optionValues from options', () => {
    const options: RawShopifyOption[] = [{ name: 'Color', values: ['Red'], position: 1 }]
    const result = transformVariant(makeVariant({ option1: 'Red', option2: null }), 'USD', options)
    expect(result.id).toBe('1111')
    expect(result.optionValues).toEqual({ Color: 'Red' })
  })

  it('maps inventoryItemId', () => {
    const result = transformVariant(makeVariant())
    expect(result.inventoryItemId).toBe('9999')
  })
})
