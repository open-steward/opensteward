import { describe, it, expect } from 'vitest'
import {
  transformOfferToInventoryLevel,
  type RawMiraklOffer,
} from '../../../../../../../src/verticals/ecommerce/adapters/mirakl/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeRaw(overrides: Partial<RawMiraklOffer> = {}): RawMiraklOffer {
  return {
    offer_id: 'OFFER-99',
    shop_sku: 'SKU-A',
    quantity: 42,
    update_date: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformOfferToInventoryLevel (Mirakl)', () => {
  it('synthesises id as offerId:locationId', () => {
    const result = transformOfferToInventoryLevel(makeRaw())
    expect(result.id).toBe('OFFER-99:default')
  })

  it('maps offer_id to variantId', () => {
    const result = transformOfferToInventoryLevel(makeRaw())
    expect(result.variantId).toBe('OFFER-99')
  })

  it('defaults locationId to "default"', () => {
    const result = transformOfferToInventoryLevel(makeRaw())
    expect(result.locationId).toBe('default')
  })

  it('accepts a custom locationId', () => {
    const result = transformOfferToInventoryLevel(makeRaw(), 'WH-1')
    expect(result.id).toBe('OFFER-99:WH-1')
    expect(result.locationId).toBe('WH-1')
  })

  it('maps quantity to available', () => {
    const result = transformOfferToInventoryLevel(makeRaw())
    expect(result.available).toBe(42)
  })

  it('clamps negative quantity to 0', () => {
    const result = transformOfferToInventoryLevel(makeRaw({ quantity: -5 }))
    expect(result.available).toBe(0)
  })

  it('defaults to 0 when quantity is null', () => {
    const result = transformOfferToInventoryLevel(makeRaw({ quantity: null }))
    expect(result.available).toBe(0)
  })

  it('maps update_date to updatedAt', () => {
    const result = transformOfferToInventoryLevel(makeRaw())
    expect(result.updatedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('falls back to shop_sku when offer_id is null', () => {
    const result = transformOfferToInventoryLevel(makeRaw({ offer_id: null }))
    expect(result.variantId).toBe('SKU-A')
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const result = transformOfferToInventoryLevel(makeRaw())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
