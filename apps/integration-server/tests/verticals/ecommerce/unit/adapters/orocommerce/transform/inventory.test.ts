import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawOroInventoryLevel,
} from '../../../../../../../src/verticals/ecommerce/adapters/orocommerce/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeInventory(overrides: Partial<RawOroInventoryLevel> = {}): RawOroInventoryLevel {
  return {
    id: 'il-77',
    quantity: 150,
    productUnitCode: 'item',
    product: { id: '43' },
    warehouse: { id: '5' },
    _type: 'inventorylevels',
    ...overrides,
  }
}

describe('transformInventoryLevel (OroCommerce)', () => {
  it('maps core fields', () => {
    const result = transformInventoryLevel(makeInventory())
    expect(result.id).toBe('il-77')
    expect(result.variantId).toBe('43')
    expect(result.locationId).toBe('5')
    expect(result.available).toBe(150)
  })

  it('synthesises id from product:warehouse when id is missing', () => {
    const result = transformInventoryLevel(makeInventory({ id: '' }))
    expect(result.id).toBe('43:5')
  })

  it('defaults available to 0 when quantity is missing', () => {
    const result = transformInventoryLevel(makeInventory({ quantity: undefined }))
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
