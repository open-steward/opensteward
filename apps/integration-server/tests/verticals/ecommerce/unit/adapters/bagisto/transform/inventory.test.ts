import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type BagistoInventory,
} from '../../../../../../../src/verticals/ecommerce/adapters/bagisto/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeInventory(overrides: Partial<BagistoInventory> = {}): BagistoInventory {
  return {
    id: 42,
    qty: 100,
    product_id: 5,
    inventory_source_id: 1,
    inventory_source: { id: 1, name: 'Default Warehouse' },
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('transformInventoryLevel (Bagisto)', () => {
  it('builds composite id from variantId and locationId', () => {
    const result = transformInventoryLevel(makeInventory())
    expect(result.id).toBe('5:default:1')
  })

  it('builds variantId from productId with :default suffix', () => {
    const result = transformInventoryLevel(makeInventory())
    expect(result.variantId).toBe('5:default')
  })

  it('maps locationId from inventory_source_id', () => {
    const result = transformInventoryLevel(makeInventory())
    expect(result.locationId).toBe('1')
  })

  it('maps available quantity from qty', () => {
    const result = transformInventoryLevel(makeInventory())
    expect(result.available).toBe(100)
  })

  it('maps zero quantity', () => {
    const result = transformInventoryLevel(makeInventory({ qty: 0 }))
    expect(result.available).toBe(0)
  })

  it('handles null qty as 0', () => {
    const result = transformInventoryLevel(makeInventory({ qty: null }))
    expect(result.available).toBe(0)
  })

  it('falls back to inventory_source.id when inventory_source_id is absent', () => {
    const result = transformInventoryLevel(
      makeInventory({ inventory_source_id: null }),
    )
    expect(result.locationId).toBe('1')
  })

  it('falls back to "default" locationId when no source info', () => {
    const result = transformInventoryLevel(
      makeInventory({ inventory_source_id: null, inventory_source: null }),
    )
    expect(result.locationId).toBe('default')
    expect(result.id).toBe('5:default:default')
  })

  it('maps productId=unknown when product_id is absent', () => {
    const result = transformInventoryLevel(makeInventory({ product_id: null }))
    expect(result.variantId).toBe('unknown:default')
  })

  it('stringifies numeric product_id', () => {
    const result = transformInventoryLevel(makeInventory({ product_id: 99 }))
    expect(result.variantId).toBe('99:default')
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

  it('handles large quantities correctly', () => {
    const result = transformInventoryLevel(makeInventory({ qty: 999999 }))
    expect(result.available).toBe(999999)
  })

  it('handles string inventory_source_id', () => {
    const result = transformInventoryLevel(makeInventory({ inventory_source_id: '3' }))
    expect(result.locationId).toBe('3')
  })
})
