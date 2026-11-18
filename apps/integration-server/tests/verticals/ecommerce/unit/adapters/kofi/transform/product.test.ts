import { describe, it, expect } from 'vitest'
import {
  transformShopItem,
  type RawKofiShopItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/kofi/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeShopItem(overrides: Partial<RawKofiShopItem> = {}): RawKofiShopItem {
  return {
    direct_link_code: 'abc-001',
    variation_name: 'Digital Sticker Pack',
    quantity: 1,
    ...overrides,
  }
}

describe('transformShopItem (Ko-fi)', () => {
  it('uses direct_link_code as the canonical id', () => {
    const result = transformShopItem(makeShopItem())
    expect(result.id).toBe('abc-001')
  })

  it('uses variation_name as the canonical title', () => {
    const result = transformShopItem(makeShopItem())
    expect(result.title).toBe('Digital Sticker Pack')
  })

  it('defaults title to "Ko-fi Shop Item" when variation_name is missing', () => {
    const result = transformShopItem(makeShopItem({ variation_name: undefined }))
    expect(result.title).toBe('Ko-fi Shop Item')
  })

  it('defaults title to "Ko-fi Shop Item" when variation_name is null', () => {
    const result = transformShopItem(makeShopItem({ variation_name: null }))
    expect(result.title).toBe('Ko-fi Shop Item')
  })

  it('always sets status to ACTIVE', () => {
    const result = transformShopItem(makeShopItem())
    expect(result.status).toBe('ACTIVE')
  })

  it('preserves the raw item in metadata verbatim', () => {
    const raw = makeShopItem({ quantity: 3 })
    const result = transformShopItem(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes ProductSchema validation', () => {
    const result = transformShopItem(makeShopItem())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('handles extra unknown fields in raw and keeps them in metadata', () => {
    const raw = makeShopItem({ custom_field: 'hello' })
    const result = transformShopItem(raw)
    expect((result.metadata as Record<string, unknown>)['custom_field']).toBe('hello')
  })

  it('does not set images, tags, variants or other optional fields', () => {
    const result = transformShopItem(makeShopItem())
    expect(result.images).toBeUndefined()
    expect(result.tags).toBeUndefined()
    expect(result.variants).toBeUndefined()
  })

  it('handles a minimal shop item with only direct_link_code', () => {
    const minimal: RawKofiShopItem = { direct_link_code: 'min-001' }
    const result = transformShopItem(minimal)
    expect(result.id).toBe('min-001')
    expect(result.title).toBe('Ko-fi Shop Item')
    expect(result.status).toBe('ACTIVE')
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('maps a multi-quantity shop item correctly', () => {
    const result = transformShopItem(makeShopItem({ quantity: 5 }))
    expect((result.metadata as Record<string, unknown>)['quantity']).toBe(5)
  })
})
