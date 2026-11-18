import { describe, it, expect } from 'vitest'
import {
  transformExtra,
  type BmacExtra,
} from '../../../../../../../src/verticals/ecommerce/adapters/buymeacoffee/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeExtra(overrides: Partial<BmacExtra> = {}): BmacExtra {
  return {
    extra_id: 777,
    extra_title: 'My eBook',
    extra_description: 'A great book about nothing',
    extra_price: '9.99',
    extra_currency: 'USD',
    extra_quantity: null,
    extra_created_on: '2024-01-10T00:00:00.000Z',
    extra_updated_on: '2024-01-15T00:00:00.000Z',
    extra_url: 'https-buymeacoffee-com-creator-extras-777',
    ...overrides,
  }
}

// ── transformExtra ────────────────────────────────────────────────────────────

describe('transformExtra (Buy Me a Coffee)', () => {
  it('stringifies extra_id as the canonical id', () => {
    const result = transformExtra(makeExtra())
    expect(result.id).toBe('777')
  })

  it('maps extra_title to canonical title', () => {
    const result = transformExtra(makeExtra())
    expect(result.title).toBe('My eBook')
  })

  it('maps extra_description to canonical description', () => {
    const result = transformExtra(makeExtra())
    expect(result.description).toBe('A great book about nothing')
  })

  it('maps extra_url to canonical handle', () => {
    const result = transformExtra(makeExtra())
    expect(result.handle).toBe('https-buymeacoffee-com-creator-extras-777')
  })

  it('always sets status to ACTIVE', () => {
    const result = transformExtra(makeExtra())
    expect(result.status).toBe('ACTIVE')
  })

  it('sets productType to "digital"', () => {
    const result = transformExtra(makeExtra())
    expect(result.productType).toBe('digital')
  })

  it('creates a single variant with the parsed price', () => {
    const result = transformExtra(makeExtra())
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.price).toEqual({ amount: 999, currency: 'USD' })
  })

  it('uses extra_currency in the variant price', () => {
    const result = transformExtra(makeExtra({ extra_currency: 'EUR' }))
    expect(result.variants![0]!.price.currency).toBe('EUR')
  })

  it('defaults currency to USD when extra_currency is missing', () => {
    const result = transformExtra(makeExtra({ extra_currency: null }))
    expect(result.variants![0]!.price.currency).toBe('USD')
  })

  it('maps extra_created_on to createdAt', () => {
    const result = transformExtra(makeExtra())
    expect(result.createdAt).toBe('2024-01-10T00:00:00.000Z')
  })

  it('maps extra_updated_on to updatedAt', () => {
    const result = transformExtra(makeExtra())
    expect(result.updatedAt).toBe('2024-01-15T00:00:00.000Z')
  })

  it('preserves the raw object in metadata verbatim', () => {
    const raw = makeExtra()
    const result = transformExtra(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes ProductSchema validation for a fully-populated extra', () => {
    const result = transformExtra(makeExtra())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('produces no variants when extra_price is null', () => {
    const result = transformExtra(makeExtra({ extra_price: null }))
    expect(result.variants).toBeUndefined()
  })

  it('produces no variants when extra_price is empty string', () => {
    const result = transformExtra(makeExtra({ extra_price: '' }))
    expect(result.variants).toBeUndefined()
  })

  it('handles a non-null extra_quantity in metadata', () => {
    const raw = makeExtra({ extra_quantity: 50 })
    const result = transformExtra(raw)
    expect((result.metadata as Record<string, unknown>)['extra_quantity']).toBe(50)
  })

  it('omits description when extra_description is null', () => {
    const result = transformExtra(makeExtra({ extra_description: null }))
    expect(result.description).toBeUndefined()
  })

  it('omits handle when extra_url is null', () => {
    const result = transformExtra(makeExtra({ extra_url: null }))
    expect(result.handle).toBeUndefined()
  })

  it('passes ProductSchema validation for a minimal extra (no optional fields)', () => {
    const minimal: BmacExtra = { extra_id: 1, extra_title: 'Minimal Item' }
    const result = transformExtra(minimal)
    expect(result.id).toBe('1')
    expect(result.title).toBe('Minimal Item')
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('handles extra unknown fields in raw and preserves them in metadata', () => {
    const raw = makeExtra({ custom_field: 'hello' })
    const result = transformExtra(raw)
    expect((result.metadata as Record<string, unknown>)['custom_field']).toBe('hello')
  })
})
