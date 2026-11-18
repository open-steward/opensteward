import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformProductVariant,
  untransformProduct,
  untransformProductVariant,
  type RawMedusaProduct,
  type RawMedusaVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/medusa/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeVariant(overrides: Partial<RawMedusaVariant> = {}): RawMedusaVariant {
  return {
    id: 'variant_01',
    title: 'Small / Blue',
    sku: 'TEE-S-BLUE',
    barcode: '1234567890',
    weight: 180,
    prices: [
      { id: 'price_01', amount: 1999, currency_code: 'USD' },
      { id: 'price_02', amount: 1799, currency_code: 'EUR' },
    ],
    options: [
      { value: 'S', option: { title: 'Size', id: 'opt_size' } },
      { value: 'Blue', option: { title: 'Color', id: 'opt_color' } },
    ],
    inventory_items: [{ inventory_item_id: 'inv_01' }],
    product_id: 'prod_01',
    ...overrides,
  }
}

function makeProduct(overrides: Partial<RawMedusaProduct> = {}): RawMedusaProduct {
  return {
    id: 'prod_01',
    title: 'Ocean Blue T-Shirt',
    description: '<p>A comfy tee.</p>',
    handle: 'ocean-blue-t-shirt',
    status: 'published',
    type: { value: 'Shirts' },
    tags: [
      { id: 'tag_01', value: 'cotton' },
      { id: 'tag_02', value: 'summer' },
    ],
    options: [
      { id: 'opt_size', title: 'Size', values: [{ value: 'S' }, { value: 'M' }, { value: 'L' }] },
      { id: 'opt_color', title: 'Color', values: [{ value: 'Blue' }] },
    ],
    variants: [makeVariant()],
    images: [
      { id: 'img_01', url: 'https://cdn.example.com/img/001.jpg', rank: 0 },
    ],
    created_at: '2024-01-10T12:00:00Z',
    updated_at: '2024-02-01T09:00:00Z',
    ...overrides,
  }
}

describe('transformProduct (Medusa v2)', () => {
  it('maps core fields', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('prod_01')
    expect(result.title).toBe('Ocean Blue T-Shirt')
    expect(result.handle).toBe('ocean-blue-t-shirt')
    expect(result.description).toBe('<p>A comfy tee.</p>')
    expect(result.productType).toBe('Shirts')
    expect(result.status).toBe('ACTIVE')
  })

  it('maps status: published → ACTIVE, draft → DRAFT, proposed → ARCHIVED', () => {
    expect(transformProduct(makeProduct({ status: 'published' })).status).toBe('ACTIVE')
    expect(transformProduct(makeProduct({ status: 'draft' })).status).toBe('DRAFT')
    expect(transformProduct(makeProduct({ status: 'proposed' })).status).toBe('ARCHIVED')
    expect(transformProduct(makeProduct({ status: 'rejected' })).status).toBe('ARCHIVED')
  })

  it('maps tags and options', () => {
    const result = transformProduct(makeProduct())
    expect(result.tags).toEqual(['cotton', 'summer'])
    expect(result.options).toHaveLength(2)
    expect(result.options![0]).toMatchObject({ name: 'Size', values: ['S', 'M', 'L'] })
  })

  it('maps nested variants with Medusa ids', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('variant_01')
    expect(v.productId).toBe('prod_01')
    expect(v.sku).toBe('TEE-S-BLUE')
    expect(v.barcode).toBe('1234567890')
    // Medusa prices are in cents — should be divided by 100
    expect(v.price).toEqual({ amount: 1999, currency: 'USD' })
    expect(v.optionValues).toEqual({ Size: 'S', Color: 'Blue' })
    expect(v.inventoryItemId).toBe('inv_01')
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
    const canonical = transformProduct(makeProduct())
    const body = untransformProduct(canonical)
    expect(body['title']).toBe('Ocean Blue T-Shirt')
    expect(body['description']).toBe('<p>A comfy tee.</p>')
    expect(body['handle']).toBe('ocean-blue-t-shirt')
    expect(body['status']).toBe('published')
  })
})

describe('transformProductVariant (Medusa v2) standalone', () => {
  it('builds a canonical variant from a raw Medusa variant', () => {
    const v = transformProductVariant(makeVariant(), 'prod_01')
    expect(v.id).toBe('variant_01')
    expect(v.productId).toBe('prod_01')
    expect(v.weight).toBe(180)
    expect(v.weightUnit).toBe('g')
  })

  it('handles variant with no prices gracefully', () => {
    const v = transformProductVariant(makeVariant({ prices: [] }), 'prod_01')
    expect(v.price).toEqual({ amount: 0, currency: 'USD' })
  })

  it('untransforms variant price back to cents', () => {
    const body = untransformProductVariant({
      price: { amount: 2999, currency: 'USD' },
      sku: 'TEST-SKU',
    })
    expect(body['sku']).toBe('TEST-SKU')
    const prices = body['prices'] as Array<{ amount: number; currency_code: string }>
    expect(prices[0]!.amount).toBe(2999)
    expect(prices[0]!.currency_code).toBe('USD')
  })
})
