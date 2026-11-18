import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawMagentoSourceItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/magento/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeSourceItem(
  overrides: Partial<RawMagentoSourceItem> = {},
): RawMagentoSourceItem {
  return {
    sku: 'TEE-OCEAN-BLUE-S',
    source_code: 'default',
    quantity: 17,
    status: 1,
    ...overrides,
  }
}

describe('transformInventoryLevel (Magento)', () => {
  it('synthesises a composite id from sku and source_code', () => {
    const result = transformInventoryLevel(makeSourceItem())
    expect(result.id).toBe('TEE-OCEAN-BLUE-S:default')
    expect(typeof result.id).toBe('string')
    expect(result.variantId).toBe('TEE-OCEAN-BLUE-S')
    expect(result.locationId).toBe('default')
    expect(result.available).toBe(17)
  })

  it('accepts zero quantities without defaulting them away', () => {
    const result = transformInventoryLevel(
      makeSourceItem({ quantity: 0, status: 0 }),
    )
    expect(result.available).toBe(0)
  })

  it('maps non-default source codes for multi-location stores', () => {
    const result = transformInventoryLevel(
      makeSourceItem({ source_code: 'warehouse_east', quantity: 42 }),
    )
    expect(result.locationId).toBe('warehouse_east')
    expect(result.id).toBe('TEE-OCEAN-BLUE-S:warehouse_east')
    expect(result.available).toBe(42)
  })

  it('preserves raw payload in metadata unmodified', () => {
    const raw = makeSourceItem()
    const result = transformInventoryLevel(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeSourceItem())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
