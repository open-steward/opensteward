import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawSquarespaceInventoryItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/squarespace/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeInventory(
  overrides: Partial<RawSquarespaceInventoryItem> = {},
): RawSquarespaceInventoryItem {
  return {
    variantId: 'var-001',
    sku: 'TEE-S-WHITE',
    isUnlimited: false,
    quantity: 42,
    ...overrides,
  }
}

describe('transformInventoryLevel', () => {
  it('maps fields and synthesises composite id', () => {
    const result = transformInventoryLevel(makeInventory())
    expect(result.id).toBe('var-001:default')
    expect(result.variantId).toBe('var-001')
    expect(result.locationId).toBe('default')
    expect(result.available).toBe(42)
  })

  it('defaults null quantity to 0', () => {
    const result = transformInventoryLevel(makeInventory({ quantity: null }))
    expect(result.available).toBe(0)
  })

  it('returns high stock for unlimited items', () => {
    const result = transformInventoryLevel(makeInventory({ isUnlimited: true }))
    expect(result.available).toBe(999999)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeInventory()
    const result = transformInventoryLevel(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeInventory())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
