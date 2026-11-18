import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawVolusionInventory,
} from '../../../../../../../src/verticals/ecommerce/adapters/volusion/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeInventory(overrides: Partial<RawVolusionInventory> = {}): RawVolusionInventory {
  return {
    ProductCode: 'TSHIRT-BLU-S',
    StockQuantity: 50,
    WarehouseQuantity: 75,
    LastModified: '2024-05-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformInventoryLevel', () => {
  it('maps core fields with synthetic id and default location', () => {
    const result = transformInventoryLevel(makeInventory())
    expect(result.id).toBe('TSHIRT-BLU-S:default')
    expect(result.variantId).toBe('TSHIRT-BLU-S')
    expect(result.locationId).toBe('default')
    expect(result.available).toBe(50)
    expect(result.onHand).toBe(75)
  })

  it('defaults null stock to 0', () => {
    const result = transformInventoryLevel(makeInventory({ StockQuantity: null }))
    expect(result.available).toBe(0)
  })

  it('handles missing warehouse quantity', () => {
    const result = transformInventoryLevel(makeInventory({ WarehouseQuantity: null }))
    expect(result.onHand).toBeUndefined()
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
