import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
  untransformProduct,
  untransformVariant,
  type RawShopifyProduct,
  type RawShopifyVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/shogun/transform/product'
import { ProductSchema, ProductVariantSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeVariant(overrides: Partial<RawShopifyVariant> = {}): RawShopifyVariant {
  return {
    id: 101,
    product_id: 1,
    title: 'Black / M',
    price: '29.99',
    compare_at_price: '39.99',
    sku: 'WK-BLK-M',
    barcode: '0123456789012',
    position: 0,
    inventory_item_id: 9001,
    weight: 850,
    weight_unit: 'g',
    taxable: true,
    requires_shipping: true,
    option1: 'Black',
    option2: 'M',
    option3: null,
    ...overrides,
  }
}

function makeProduct(overrides: Partial<RawShopifyProduct> = {}): RawShopifyProduct {
  return {
    id: 1,
    title: 'Wireless Keyboard',
    body_html: '<p>A compact wireless keyboard.</p>',
    handle: 'wireless-keyboard',
    status: 'active',
    vendor: 'Acme Industries',
    product_type: 'Accessories',
    tags: 'accessories, wireless',
    options: [
      { id: 10, name: 'Color', position: 0, values: ['Black', 'White'] },
      { id: 11, name: 'Size', position: 1, values: ['M', 'L'] },
    ],
    variants: [makeVariant()],
    images: [
      { id: 201, src: 'https://cdn.example.com/keyboard.jpg', alt: 'Wireless Keyboard', width: 1200, height: 800, position: 0 },
    ],
    created_at: '2026-01-15T09:30:00.000Z',
    updated_at: '2026-02-01T14:20:00.000Z',
    published_at: '2026-01-15T09:30:00.000Z',
    ...overrides,
  }
}

// ── transformProduct ──────────────────────────────────────────────────────────

describe('transformProduct (Shogun)', () => {
  it('maps id as string', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('1')
  })

  it('maps title and description from body_html', () => {
    const result = transformProduct(makeProduct())
    expect(result.title).toBe('Wireless Keyboard')
    expect(result.description).toBe('<p>A compact wireless keyboard.</p>')
  })

  it('maps handle', () => {
    const result = transformProduct(makeProduct())
    expect(result.handle).toBe('wireless-keyboard')
  })

  it('maps active status to ACTIVE', () => {
    const result = transformProduct(makeProduct())
    expect(result.status).toBe('ACTIVE')
  })

  it('maps archived status to ARCHIVED', () => {
    const result = transformProduct(makeProduct({ status: 'archived' }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('converts variant price from major units to minor units', () => {
    const result = transformProduct(makeProduct(), 'USD')
    // 29.99 USD → 2999 cents
    expect(result.variants![0]!.price).toEqual({ amount: 2999, currency: 'USD' })
  })

  it('converts compareAtPrice from major units to minor units', () => {
    const result = transformProduct(makeProduct(), 'USD')
    expect(result.variants![0]!.compareAtPrice).toEqual({ amount: 3999, currency: 'USD' })
  })

  it('maps tags by splitting comma-separated string', () => {
    const result = transformProduct(makeProduct())
    expect(result.tags).toEqual(['accessories', 'wireless'])
  })

  it('maps images with id and url', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(1)
    expect(result.images![0]).toMatchObject({
      id: '201',
      url: 'https://cdn.example.com/keyboard.jpg',
      alt: 'Wireless Keyboard',
    })
  })

  it('maps options with name and values', () => {
    const result = transformProduct(makeProduct())
    expect(result.options).toHaveLength(2)
    expect(result.options![0]).toMatchObject({ name: 'Color', values: ['Black', 'White'] })
  })

  it('builds optionValues record from option1/option2', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants![0]!.optionValues).toEqual({ Color: 'Black', Size: 'M' })
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformProduct(makeProduct())
    expect(result.createdAt).toBe('2026-01-15T09:30:00.000Z')
    expect(result.updatedAt).toBe('2026-02-01T14:20:00.000Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying ProductSchema', () => {
    const result = transformProduct(makeProduct())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

// ── transformVariant ──────────────────────────────────────────────────────────

describe('transformVariant (Shogun)', () => {
  it('maps id as string', () => {
    const result = transformVariant(makeVariant(), 'USD')
    expect(result.id).toBe('101')
  })

  it('maps sku and barcode', () => {
    const result = transformVariant(makeVariant(), 'USD')
    expect(result.sku).toBe('WK-BLK-M')
    expect(result.barcode).toBe('0123456789012')
  })

  it('converts price string to minor units', () => {
    const result = transformVariant(makeVariant(), 'USD')
    expect(result.price).toEqual({ amount: 2999, currency: 'USD' })
  })

  it('maps weightUnit g correctly', () => {
    const result = transformVariant(makeVariant(), 'USD')
    expect(result.weightUnit).toBe('g')
  })

  it('maps inventoryItemId as string', () => {
    const result = transformVariant(makeVariant(), 'USD')
    expect(result.inventoryItemId).toBe('9001')
  })

  it('produces a payload satisfying ProductVariantSchema', () => {
    const result = transformVariant(makeVariant(), 'USD')
    expect(() => ProductVariantSchema.parse(result)).not.toThrow()
  })
})

// ── untransformProduct ────────────────────────────────────────────────────────

describe('untransformProduct (Shogun)', () => {
  it('maps title, handle, and status', () => {
    const body = untransformProduct({ title: 'New Keyboard', handle: 'new-keyboard', status: 'ACTIVE' })
    expect(body['title']).toBe('New Keyboard')
    expect(body['handle']).toBe('new-keyboard')
    expect(body['status']).toBe('active')
  })

  it('joins tags array into comma string', () => {
    const body = untransformProduct({ tags: ['accessories', 'wireless'] })
    expect(body['tags']).toBe('accessories, wireless')
  })
})

// ── untransformVariant ────────────────────────────────────────────────────────

describe('untransformVariant (Shogun)', () => {
  it('maps sku, barcode, and title', () => {
    const body = untransformVariant({ id: '101', sku: 'WK-BLK-M', barcode: '0123456789012', title: 'Black / M', price: { amount: 2999, currency: 'USD' }, metadata: {} })
    expect(body['sku']).toBe('WK-BLK-M')
    expect(body['barcode']).toBe('0123456789012')
    expect(body['title']).toBe('Black / M')
  })
})
