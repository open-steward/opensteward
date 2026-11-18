import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  pickTranslation,
  type ShuupProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/shuup/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<ShuupProduct> = {}): ShuupProduct {
  return {
    id: 1,
    name: { en: 'Wireless Keyboard', fi: 'Langaton näppäimistö' },
    description: { en: '<p>A compact wireless keyboard.</p>' },
    sku: 'PROD-001',
    mode: 1,
    shipping_mode: 1,
    status: 1,
    net_weight: 0.45,
    gross_weight: 0.5,
    created_on: '2024-01-01T10:00:00Z',
    modified_on: '2024-06-01T12:00:00Z',
    ...overrides,
  }
}

describe('pickTranslation', () => {
  it('returns English value from language map', () => {
    expect(pickTranslation({ en: 'Hello', fi: 'Hei' })).toBe('Hello')
  })

  it('falls back to first value when English is absent', () => {
    expect(pickTranslation({ fi: 'Hei', de: 'Hallo' })).toBe('Hei')
  })

  it('returns plain string unchanged', () => {
    expect(pickTranslation('Plain string')).toBe('Plain string')
  })

  it('returns empty string for null/undefined', () => {
    expect(pickTranslation(null)).toBe('')
    expect(pickTranslation(undefined)).toBe('')
  })
})

describe('transformProduct (Shuup)', () => {
  it('maps core fields and stringifies id', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.id).toBe('1')
    expect(typeof result.id).toBe('string')
    expect(result.title).toBe('Wireless Keyboard')
    expect(result.description).toBe('<p>A compact wireless keyboard.</p>')
  })

  it('maps status 1 to ACTIVE', () => {
    const result = transformProduct(makeProduct({ status: 1 }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps status 2 to DRAFT', () => {
    const result = transformProduct(makeProduct({ status: 2 }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps null status to DRAFT', () => {
    const result = transformProduct(makeProduct({ status: null }))
    expect(result.status).toBe('DRAFT')
  })

  it('picks English translation from name object', () => {
    const result = transformProduct(makeProduct({ name: { en: 'Test', fi: 'Testi' } }))
    expect(result.title).toBe('Test')
  })

  it('falls back to first language when English is missing', () => {
    const result = transformProduct(makeProduct({ name: { fi: 'Testi' } }))
    expect(result.title).toBe('Testi')
  })

  it('handles plain string name', () => {
    const result = transformProduct(makeProduct({ name: 'Plain Name' }))
    expect(result.title).toBe('Plain Name')
  })

  it('synthesises a single default variant', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('1:default')
    expect(v.productId).toBe('1')
    expect(v.sku).toBe('PROD-001')
    expect(v.price).toEqual({ amount: 0, currency: 'USD' })
    expect(v.inventoryItemId).toBe('1')
    expect((v.metadata as { synthetic?: boolean }).synthetic).toBe(true)
  })

  it('maps net_weight to variant weight in kg', () => {
    const result = transformProduct(makeProduct({ net_weight: 0.45 }))
    const v = result.variants![0]!
    expect(v.weight).toBe(0.45)
    expect(v.weightUnit).toBe('kg')
  })

  it('falls back to gross_weight when net_weight is null', () => {
    const result = transformProduct(makeProduct({ net_weight: null, gross_weight: 0.5 }))
    const v = result.variants![0]!
    expect(v.weight).toBe(0.5)
  })

  it('omits weight when both net and gross are null', () => {
    const result = transformProduct(makeProduct({ net_weight: null, gross_weight: null }))
    const v = result.variants![0]!
    expect(v.weight).toBeUndefined()
    expect(v.weightUnit).toBeUndefined()
  })

  it('handles null sku gracefully', () => {
    const result = transformProduct(makeProduct({ sku: null }))
    const v = result.variants![0]!
    expect(v.sku).toBeUndefined()
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformProduct(makeProduct())
    expect(result.createdAt).toBe('2024-01-01T10:00:00Z')
    expect(result.updatedAt).toBe('2024-06-01T12:00:00Z')
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
})

describe('untransformProduct (Shuup)', () => {
  it('wraps title in English translation object', () => {
    const body = untransformProduct({ title: 'Wireless Keyboard' })
    expect(body['name']).toEqual({ en: 'Wireless Keyboard' })
  })

  it('wraps description in English translation object', () => {
    const body = untransformProduct({ description: '<p>Description</p>' })
    expect(body['description']).toEqual({ en: '<p>Description</p>' })
  })

  it('maps ACTIVE status to 1', () => {
    const body = untransformProduct({ status: 'ACTIVE' })
    expect(body['status']).toBe(1)
  })

  it('maps DRAFT status to 2', () => {
    const body = untransformProduct({ status: 'DRAFT' })
    expect(body['status']).toBe(2)
  })

  it('extracts sku from first variant', () => {
    const body = untransformProduct({
      variants: [{ id: '1:default', sku: 'PROD-001', price: { amount: 0, currency: 'USD' }, metadata: {} }],
    })
    expect(body['sku']).toBe('PROD-001')
  })

  it('extracts net_weight from first variant', () => {
    const body = untransformProduct({
      variants: [{ id: '1:default', weight: 0.45, price: { amount: 0, currency: 'USD' }, metadata: {} }],
    })
    expect(body['net_weight']).toBe(0.45)
  })
})
