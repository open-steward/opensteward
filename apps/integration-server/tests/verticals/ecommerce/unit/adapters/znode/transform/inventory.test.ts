import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawZnodeInventory,
} from '../../../../../../../src/verticals/ecommerce/adapters/znode/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeInventory(overrides: Partial<RawZnodeInventory> = {}): RawZnodeInventory {
  return {
    InventoryId: 77,
    Quantity: 150,
    ProductId: 43,
    WarehouseId: 5,
    SKU: 'PUMP-3000-STEEL-SM',
    ...overrides,
  }
}

describe('transformInventoryLevel (Znode)', () => {
  it('maps core fields', () => {
    const result = transformInventoryLevel(makeInventory())
    expect(result.id).toBe('77')
    expect(result.variantId).toBe('43')
    expect(result.locationId).toBe('5')
    expect(result.available).toBe(150)
  })

  it('synthesises id from product:warehouse when InventoryId is missing', () => {
    const result = transformInventoryLevel(makeInventory({ InventoryId: undefined }))
    expect(result.id).toBe('43:5')
  })

  it('defaults available to 0 when Quantity is missing', () => {
    const result = transformInventoryLevel(makeInventory({ Quantity: undefined }))
    expect(result.available).toBe(0)
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
