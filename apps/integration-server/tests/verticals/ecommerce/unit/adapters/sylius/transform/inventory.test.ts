import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawSyliusInventoryEntry,
} from '../../../../../../../src/verticals/ecommerce/adapters/sylius/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeInventoryEntry(
  overrides: Partial<RawSyliusInventoryEntry> = {},
): RawSyliusInventoryEntry {
  return {
    id: 77,
    code: 'MUG_BLUE_S',
    tracked: true,
    onHand: 50,
    onHold: 5,
    ...overrides,
  }
}

describe('transformInventoryLevel (Sylius)', () => {
  it('maps core fields', () => {
    const result = transformInventoryLevel(makeInventoryEntry())
    expect(result.id).toBe('MUG_BLUE_S:default')
    expect(result.variantId).toBe('MUG_BLUE_S')
    expect(result.locationId).toBe('default')
    expect(result.available).toBe(45) // 50 - 5
  })

  it('calculates available as onHand minus onHold', () => {
    const result = transformInventoryLevel(makeInventoryEntry({ onHand: 100, onHold: 20 }))
    expect(result.available).toBe(80)
  })

  it('reports committed stock from onHold', () => {
    const result = transformInventoryLevel(makeInventoryEntry())
    expect(result.committed).toBe(5)
    expect(result.onHand).toBe(50)
  })

  it('omits committed and onHand when zero', () => {
    const result = transformInventoryLevel(makeInventoryEntry({ onHand: 0, onHold: 0 }))
    expect(result.available).toBe(0)
    expect(result.committed).toBeUndefined()
    expect(result.onHand).toBeUndefined()
  })

  it('defaults onHand and onHold to 0 when undefined', () => {
    const result = transformInventoryLevel(makeInventoryEntry({ onHand: undefined, onHold: undefined }))
    expect(result.available).toBe(0)
  })

  it('preserves metadata', () => {
    const raw = makeInventoryEntry()
    const result = transformInventoryLevel(raw)
    expect(result.metadata).toBe(raw)
  })

  it('satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeInventoryEntry())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
