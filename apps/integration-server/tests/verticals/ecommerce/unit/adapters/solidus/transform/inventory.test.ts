import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawSolidusStockItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/solidus/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeStockItem(
  overrides: Partial<RawSolidusStockItem> = {},
): RawSolidusStockItem {
  return {
    id: 77,
    variant_id: 101,
    stock_location_id: 1,
    count_on_hand: 25,
    backorderable: true,
    created_at: '2024-01-15T10:00:00.000Z',
    updated_at: '2024-03-01T08:00:00.000Z',
    ...overrides,
  }
}

describe('transformInventoryLevel (Solidus)', () => {
  it('maps core fields', () => {
    const result = transformInventoryLevel(makeStockItem())
    expect(result.id).toBe('101:1')
    expect(result.variantId).toBe('101')
    expect(result.locationId).toBe('1')
    expect(result.available).toBe(25)
  })

  it('synthesises composite id from variant_id and stock_location_id', () => {
    const result = transformInventoryLevel(makeStockItem({ variant_id: 200, stock_location_id: 3 }))
    expect(result.id).toBe('200:3')
  })

  it('defaults available to 0 when count_on_hand is undefined', () => {
    const result = transformInventoryLevel(makeStockItem({ count_on_hand: undefined }))
    expect(result.available).toBe(0)
  })

  it('preserves metadata', () => {
    const raw = makeStockItem()
    const result = transformInventoryLevel(raw)
    expect(result.metadata).toBe(raw)
  })

  it('satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeStockItem())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
