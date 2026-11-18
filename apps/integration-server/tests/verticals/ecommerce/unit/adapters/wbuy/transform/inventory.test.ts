import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawWooCommerceVariationStock,
} from '../../../../../../../src/verticals/ecommerce/adapters/wbuy/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeVariationStock(
  overrides: Partial<RawWooCommerceVariationStock> = {},
): RawWooCommerceVariationStock {
  return {
    id: 7,
    stock_quantity: 25,
    date_modified_gmt: '2024-05-01T10:00:00.000Z',
    ...overrides,
  }
}

describe('transformInventoryLevel (wbuy)', () => {
  it('synthesises a composite id and default location', () => {
    const result = transformInventoryLevel(makeVariationStock(), '101')
    expect(result.id).toBe('101:7:default')
    expect(typeof result.id).toBe('string')
    expect(result.variantId).toBe('101:7')
    expect(result.locationId).toBe('default')
    expect(result.available).toBe(25)
    expect(result.updatedAt).toBe('2024-05-01T10:00:00.000Z')
  })

  it('defaults null stock_quantity to 0', () => {
    const result = transformInventoryLevel(
      makeVariationStock({ stock_quantity: null }),
      '101',
    )
    expect(result.available).toBe(0)
  })

  it('preserves raw payload in metadata and validates against InventoryLevelSchema', () => {
    const raw = makeVariationStock()
    const result = transformInventoryLevel(raw, '101')
    expect(result.metadata).toBe(raw)
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
