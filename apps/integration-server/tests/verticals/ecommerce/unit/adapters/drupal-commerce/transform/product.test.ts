import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
  untransformProduct,
  untransformVariant,
  type DrupalProduct,
  type DrupalVariation,
} from '../../../../../../../src/verticals/ecommerce/adapters/drupal-commerce/transform/product'
import { ProductSchema, ProductVariantSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeVariation(overrides: Partial<DrupalVariation['attributes']> = {}): DrupalVariation {
  return {
    type: 'commerce_product_variation--default',
    id: 'var-uuid-001',
    attributes: {
      title: 'Blue T-Shirt - Medium',
      sku: 'TSHIRT-BLU-M',
      status: true,
      price: { number: '29.99', currency_code: 'USD' },
      list_price: { number: '39.99', currency_code: 'USD' },
      created: 1717200000,
      changed: 1717286400,
      ...overrides,
    },
    relationships: {
      product_id: {
        data: { type: 'commerce_product--default', id: 'prod-uuid-001' },
      },
    },
  }
}

function makeProduct(overrides: Partial<DrupalProduct['attributes']> = {}): DrupalProduct {
  return {
    type: 'commerce_product--default',
    id: 'prod-uuid-001',
    attributes: {
      title: 'Blue T-Shirt',
      status: true,
      body: { value: '<p>A comfortable blue t-shirt.</p>', format: 'basic_html' },
      created: 1717200000,
      changed: 1717286400,
      ...overrides,
    },
    relationships: {
      variations: {
        data: [{ type: 'commerce_product_variation--default', id: 'var-uuid-001' }],
      },
    },
  }
}

// ── transformVariant ──────────────────────────────────────────────────────────

describe('transformVariant (Drupal Commerce)', () => {
  it('maps core variant fields', () => {
    const result = transformVariant(makeVariation())
    expect(result.id).toBe('var-uuid-001')
    expect(result.sku).toBe('TSHIRT-BLU-M')
    expect(result.title).toBe('Blue T-Shirt - Medium')
    expect(result.productId).toBe('prod-uuid-001')
  })

  it('maps price correctly', () => {
    const result = transformVariant(makeVariation())
    expect(result.price).toEqual({ amount: 2999, currency: 'USD' })
  })

  it('maps compareAtPrice from list_price', () => {
    const result = transformVariant(makeVariation())
    expect(result.compareAtPrice).toEqual({ amount: 3999, currency: 'USD' })
  })

  it('handles missing list_price gracefully', () => {
    const result = transformVariant(makeVariation({ list_price: null }))
    expect(result.compareAtPrice).toBeUndefined()
  })

  it('sets requiresShipping and taxable on variant', () => {
    const result = transformVariant(makeVariation())
    expect(result.requiresShipping).toBe(true)
    expect(result.taxable).toBe(true)
  })

  it('sets requiresShipping and taxable defaults', () => {
    const result = transformVariant(makeVariation())
    expect(result.requiresShipping).toBe(true)
    expect(result.taxable).toBe(true)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeVariation()
    const result = transformVariant(raw)
    expect(result.metadata).toBe(raw)
  })

  it('handles zero price', () => {
    const result = transformVariant(makeVariation({ price: { number: '0', currency_code: 'EUR' } }))
    expect(result.price).toEqual({ amount: 0, currency: 'EUR' })
  })

  it('handles missing price field', () => {
    const result = transformVariant(makeVariation({ price: null }))
    expect(result.price).toEqual({ amount: 0, currency: 'USD' })
  })

  it('handles no relationship (variant without product link)', () => {
    const raw: DrupalVariation = { ...makeVariation(), relationships: {} }
    const result = transformVariant(raw)
    expect(result.productId).toBeUndefined()
  })

  it('produces a payload that satisfies ProductVariantSchema', () => {
    const result = transformVariant(makeVariation())
    expect(() => ProductVariantSchema.parse(result)).not.toThrow()
  })

  it('handles variant with string attribute values', () => {
    const result = transformVariant(makeVariation({ sku: 'VAR-STRING-001' }))
    expect(result.sku).toBe('VAR-STRING-001')
  })
})

// ── transformProduct ──────────────────────────────────────────────────────────

describe('transformProduct (Drupal Commerce)', () => {
  it('maps core product fields', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('prod-uuid-001')
    expect(result.title).toBe('Blue T-Shirt')
    expect(result.description).toBe('<p>A comfortable blue t-shirt.</p>')
    expect(result.status).toBe('ACTIVE')
  })

  it('maps inactive product to DRAFT status', () => {
    const result = transformProduct(makeProduct({ status: false }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps numeric status 0 to DRAFT', () => {
    const result = transformProduct(makeProduct({ status: 0 }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps numeric status 1 to ACTIVE', () => {
    const result = transformProduct(makeProduct({ status: 1 }))
    expect(result.status).toBe('ACTIVE')
  })

  it('converts unix timestamps to ISO strings', () => {
    const result = transformProduct(makeProduct())
    expect(result.createdAt).toBe('2024-06-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-06-02T00:00:00.000Z')
  })

  it('synthesises variant stubs from relationship IDs when no included', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.id).toBe('var-uuid-001')
    expect(result.variants![0]!.productId).toBe('prod-uuid-001')
  })

  it('uses included variations when provided', () => {
    const variation = makeVariation()
    const result = transformProduct(makeProduct(), [variation])
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.sku).toBe('TSHIRT-BLU-M')
    expect(result.variants![0]!.price).toEqual({ amount: 2999, currency: 'USD' })
  })

  it('handles missing body gracefully', () => {
    const result = transformProduct(makeProduct({ body: null }))
    expect(result.description).toBeUndefined()
  })

  it('handles missing title gracefully', () => {
    const result = transformProduct(makeProduct({ title: undefined }))
    expect(result.title).toBe('')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
  })

  it('handles product with no variations', () => {
    const raw: DrupalProduct = { ...makeProduct(), relationships: { variations: { data: [] } } }
    const result = transformProduct(raw)
    expect(result.variants).toBeUndefined()
  })

  it('produces a payload that satisfies ProductSchema', () => {
    const result = transformProduct(makeProduct(), [makeVariation()])
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

// ── untransformProduct ────────────────────────────────────────────────────────

describe('untransformProduct (Drupal Commerce)', () => {
  it('produces JSON:API body with correct type', () => {
    const body = untransformProduct({ title: 'New Shirt' }) as {
      data: { type: string; attributes: Record<string, unknown> }
    }
    expect(body.data.type).toBe('commerce_product--default')
    expect(body.data.attributes['title']).toBe('New Shirt')
  })

  it('maps active status to true', () => {
    const body = untransformProduct({ status: 'ACTIVE' }) as {
      data: { attributes: Record<string, unknown> }
    }
    expect(body.data.attributes['status']).toBe(true)
  })

  it('maps DRAFT status to false', () => {
    const body = untransformProduct({ status: 'DRAFT' }) as {
      data: { attributes: Record<string, unknown> }
    }
    expect(body.data.attributes['status']).toBe(false)
  })

  it('maps description to body with basic_html format', () => {
    const body = untransformProduct({ description: '<p>Hello</p>' }) as {
      data: { attributes: Record<string, unknown> }
    }
    expect(body.data.attributes['body']).toEqual({ value: '<p>Hello</p>', format: 'basic_html' })
  })

  it('omits undefined fields', () => {
    const body = untransformProduct({}) as {
      data: { attributes: Record<string, unknown> }
    }
    expect(body.data.attributes['title']).toBeUndefined()
    expect(body.data.attributes['status']).toBeUndefined()
  })
})

// ── untransformVariant ────────────────────────────────────────────────────────

describe('untransformVariant (Drupal Commerce)', () => {
  it('produces JSON:API body with correct type', () => {
    const body = untransformVariant({
      sku: 'VAR-001',
      title: 'Variant One',
      price: { amount: 1999, currency: 'USD' },
    }) as { data: { type: string; attributes: Record<string, unknown> } }
    expect(body.data.type).toBe('commerce_product_variation--default')
    expect(body.data.attributes['sku']).toBe('VAR-001')
    expect(body.data.attributes['title']).toBe('Variant One')
    expect(body.data.attributes['price']).toEqual({ number: '1999', currency_code: 'USD' })
  })

  it('omits undefined fields', () => {
    const body = untransformVariant({}) as { data: { attributes: Record<string, unknown> } }
    expect(body.data.attributes['sku']).toBeUndefined()
    expect(body.data.attributes['price']).toBeUndefined()
  })
})
