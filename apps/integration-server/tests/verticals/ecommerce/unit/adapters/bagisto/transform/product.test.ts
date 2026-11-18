import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformProductVariant,
  untransformProduct,
  type BagistoProduct,
  type BagistoProductVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/bagisto/transform/product'
import { ProductSchema, ProductVariantSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeVariant(overrides: Partial<BagistoProductVariant> = {}): BagistoProductVariant {
  return {
    id: 10,
    sku: 'PROD-001-RED-M',
    name: 'Red / M',
    price: '29.99',
    weight: '0.5',
    status: 1,
    inventories: [{ quantity: 50 }],
    super_attributes: { Color: 'Red', Size: 'M' },
    ...overrides,
  }
}

function makeProduct(overrides: Partial<BagistoProduct> = {}): BagistoProduct {
  return {
    id: 5,
    sku: 'PROD-001',
    name: 'Wireless Keyboard',
    slug: 'wireless-keyboard',
    price: '49.99',
    status: 1,
    type: 'simple',
    description: '<p>A compact wireless keyboard.</p>',
    short_description: 'Compact wireless keyboard',
    weight: '0.75',
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-06-15T12:00:00.000Z',
    images: [
      { id: 1, url: 'https://cdn.example.com/keyboard.jpg' },
      { id: 2, url: 'https://cdn.example.com/keyboard-back.jpg' },
    ],
    categories: [{ id: 3, name: 'Electronics', slug: 'electronics' }],
    variants: [],
    super_attributes: [],
    ...overrides,
  }
}

function makeConfigurableProduct(): BagistoProduct {
  return makeProduct({
    type: 'configurable',
    variants: [makeVariant(), makeVariant({ id: 11, sku: 'PROD-001-BLUE-L', name: 'Blue / L', super_attributes: { Color: 'Blue', Size: 'L' } })],
    super_attributes: [
      { id: 1, code: 'color', label: 'Color', options: [{ id: 1, label: 'Red' }, { id: 2, label: 'Blue' }] },
      { id: 2, code: 'size', label: 'Size', options: [{ id: 3, label: 'M' }, { id: 4, label: 'L' }] },
    ],
  })
}

// ── transformProduct ──────────────────────────────────────────────────────────

describe('transformProduct (Bagisto)', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('5')
    expect(typeof result.id).toBe('string')
    expect(result.title).toBe('Wireless Keyboard')
    expect(result.description).toBe('<p>A compact wireless keyboard.</p>')
    expect(result.handle).toBe('wireless-keyboard')
    expect(result.status).toBe('ACTIVE')
  })

  it('maps status=0 to DRAFT', () => {
    const result = transformProduct(makeProduct({ status: 0 }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps status=false to DRAFT', () => {
    const result = transformProduct(makeProduct({ status: false }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps product type from first category', () => {
    const result = transformProduct(makeProduct())
    expect(result.productType).toBe('Electronics')
  })

  it('returns undefined productType when no categories', () => {
    const result = transformProduct(makeProduct({ categories: [] }))
    expect(result.productType).toBeUndefined()
  })

  it('maps images with id and url', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(2)
    expect(result.images![0]).toMatchObject({
      id: '1',
      url: 'https://cdn.example.com/keyboard.jpg',
    })
    expect(result.images![1]).toMatchObject({
      id: '2',
      url: 'https://cdn.example.com/keyboard-back.jpg',
    })
  })

  it('uses original_image_url when url is absent', () => {
    const result = transformProduct(
      makeProduct({ images: [{ original_image_url: 'https://cdn.example.com/alt.jpg' }] }),
    )
    expect(result.images![0]!.url).toBe('https://cdn.example.com/alt.jpg')
  })

  it('synthesises a single default variant for simple products', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('5:default')
    expect(v.productId).toBe('5')
    expect(v.sku).toBe('PROD-001')
    expect(v.price).toEqual({ amount: 4999, currency: 'USD' })
    expect(v.metadata['synthetic']).toBe(true)
  })

  it('maps configurable product variants', () => {
    const result = transformProduct(makeConfigurableProduct())
    expect(result.variants).toHaveLength(2)
    expect(result.variants![0]!.id).toBe('5:10')
    expect(result.variants![1]!.id).toBe('5:11')
  })

  it('maps super_attributes to product options', () => {
    const result = transformProduct(makeConfigurableProduct())
    expect(result.options).toHaveLength(2)
    expect(result.options![0]).toMatchObject({ name: 'Color', values: ['Red', 'Blue'] })
    expect(result.options![1]).toMatchObject({ name: 'Size', values: ['M', 'L'] })
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformProduct(makeProduct())
    expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-06-15T12:00:00.000Z')
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

  it('produces a valid ProductSchema for configurable product', () => {
    const result = transformProduct(makeConfigurableProduct())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('handles product with no images gracefully', () => {
    const result = transformProduct(makeProduct({ images: [] }))
    expect(result.images).toBeUndefined()
  })
})

// ── transformProductVariant ───────────────────────────────────────────────────

describe('transformProductVariant (Bagisto)', () => {
  it('maps core fields and builds composite id', () => {
    const result = transformProductVariant(makeVariant(), '5')
    expect(result.id).toBe('5:10')
    expect(result.productId).toBe('5')
    expect(result.sku).toBe('PROD-001-RED-M')
    expect(result.price).toEqual({ amount: 2999, currency: 'USD' })
  })

  it('maps optionValues from super_attributes', () => {
    const result = transformProductVariant(makeVariant(), '5')
    expect(result.optionValues).toEqual({ Color: 'Red', Size: 'M' })
  })

  it('sums inventory quantities across sources', () => {
    const v = makeVariant({ inventories: [{ quantity: 30 }, { quantity: 20 }] })
    const result = transformProductVariant(v, '5')
    expect(result.metadata['computedAvailableQty']).toBe(50)
  })

  it('handles zero inventory gracefully', () => {
    const v = makeVariant({ inventories: [] })
    const result = transformProductVariant(v, '5')
    expect(result.metadata['computedAvailableQty']).toBeUndefined()
  })

  it('maps weight and weight unit', () => {
    const result = transformProductVariant(makeVariant(), '5')
    expect(result.weight).toBe(0.5)
    expect(result.weightUnit).toBe('kg')
  })

  it('produces a payload that satisfies ProductVariantSchema', () => {
    const result = transformProductVariant(makeVariant(), '5')
    expect(() => ProductVariantSchema.parse(result)).not.toThrow()
  })
})

// ── untransformProduct ────────────────────────────────────────────────────────

describe('untransformProduct (Bagisto)', () => {
  it('maps title, description, handle, and status', () => {
    const body = untransformProduct({
      title: 'New Keyboard',
      description: 'A keyboard',
      handle: 'new-keyboard',
      status: 'ACTIVE',
    })
    expect(body['name']).toBe('New Keyboard')
    expect(body['description']).toBe('A keyboard')
    expect(body['slug']).toBe('new-keyboard')
    expect(body['status']).toBe(1)
  })

  it('maps status DRAFT to 0', () => {
    const body = untransformProduct({ status: 'DRAFT' })
    expect(body['status']).toBe(0)
  })

  it('flattens price from single variant', () => {
    const body = untransformProduct({
      variants: [{ id: '1:default', price: { amount: 9999, currency: 'USD' }, metadata: {} }],
    })
    expect(body['price']).toBe('99.99')
  })
})
