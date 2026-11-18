import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawDoocaVariationStock,
} from '../../../../../../../src/verticals/ecommerce/adapters/dooca-commerce/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeStock(overrides: Partial<RawDoocaVariationStock> = {}): RawDoocaVariationStock {
  return {
    id: 10,
    product_id: 5,
    balance: 25,
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformInventoryLevel (Dooca Commerce)', () => {
  it('builds composite id as productId:variantId:default', () => {
    const result = transformInventoryLevel(makeStock())
    expect(result.id).toBe('5:10:default')
  })

  it('sets variantId to productId:variantId composite', () => {
    const result = transformInventoryLevel(makeStock())
    expect(result.variantId).toBe('5:10')
  })

  it('accepts explicit productId parameter overriding raw product_id', () => {
    const result = transformInventoryLevel(makeStock({ product_id: null }), 'prod-99')
    expect(result.id).toBe('prod-99:10:default')
    expect(result.variantId).toBe('prod-99:10')
  })

  it('uses variantId only when no product_id or explicit productId', () => {
    const result = transformInventoryLevel(makeStock({ product_id: null }))
    expect(result.id).toBe('10:default')
    expect(result.variantId).toBe('10')
  })

  it('sets locationId to "default"', () => {
    const result = transformInventoryLevel(makeStock())
    expect(result.locationId).toBe('default')
  })

  it('maps balance to available', () => {
    const result = transformInventoryLevel(makeStock({ balance: 25 }))
    expect(result.available).toBe(25)
  })

  it('defaults available to 0 when balance is null', () => {
    const result = transformInventoryLevel(makeStock({ balance: null }))
    expect(result.available).toBe(0)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeStock()
    const result = transformInventoryLevel(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeStock())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
