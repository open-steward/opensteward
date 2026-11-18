import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  DEFAULT_LOCATION_ID,
  type RawGmarketInventoryItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/gmarket/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeInventoryItem(
  overrides: Partial<RawGmarketInventoryItem> = {},
): RawGmarketInventoryItem {
  return {
    goodsNo: 'GM-12345',
    sellerItemCode: 'SKU-001',
    stockQuantity: 75,
    reservedQuantity: 10,
    ...overrides,
  }
}

describe('transformInventoryLevel (Gmarket)', () => {
  it('synthesizes id from goodsNo and default location', () => {
    const result = transformInventoryLevel(makeInventoryItem())
    expect(result.id).toBe(`GM-12345:${DEFAULT_LOCATION_ID}`)
    expect(result.variantId).toBe('GM-12345')
    expect(result.locationId).toBe(DEFAULT_LOCATION_ID)
  })

  it('maps stockQuantity to available', () => {
    const result = transformInventoryLevel(makeInventoryItem())
    expect(result.available).toBe(75)
  })

  it('maps reservedQuantity to committed', () => {
    const result = transformInventoryLevel(makeInventoryItem())
    expect(result.committed).toBe(10)
  })

  it('defaults available to 0 when stockQuantity is missing', () => {
    const result = transformInventoryLevel(makeInventoryItem({ stockQuantity: undefined }))
    expect(result.available).toBe(0)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeInventoryItem())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
