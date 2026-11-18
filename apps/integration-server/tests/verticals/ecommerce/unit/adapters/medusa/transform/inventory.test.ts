import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawMedusaInventoryItem,
  type RawMedusaLocationLevel,
} from '../../../../../../../src/verticals/ecommerce/adapters/medusa/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeItem(overrides: Partial<RawMedusaInventoryItem> = {}): RawMedusaInventoryItem {
  return {
    id: 'inv_01',
    sku: 'TEE-S-BLUE',
    updated_at: '2024-02-01T09:00:00Z',
    ...overrides,
  }
}

function makeLocationLevel(
  overrides: Partial<RawMedusaLocationLevel> = {},
): RawMedusaLocationLevel {
  return {
    id: 'll_01',
    inventory_item_id: 'inv_01',
    location_id: 'sloc_01',
    stocked_quantity: 50,
    reserved_quantity: 5,
    incoming_quantity: 10,
    available_quantity: 45,
    ...overrides,
  }
}

describe('transformInventoryLevel (Medusa v2)', () => {
  it('maps core fields with synthesized id', () => {
    const result = transformInventoryLevel(makeItem(), makeLocationLevel(), 'variant_01')
    expect(result.id).toBe('variant_01:sloc_01')
    expect(result.variantId).toBe('variant_01')
    expect(result.locationId).toBe('sloc_01')
    expect(result.available).toBe(45)
    expect(result.committed).toBe(5)
    expect(result.incoming).toBe(10)
    expect(result.onHand).toBe(55) // stocked_quantity + reserved
  })

  it('handles zero reserved/incoming gracefully', () => {
    const ll = makeLocationLevel({
      reserved_quantity: 0,
      incoming_quantity: 0,
      available_quantity: 50,
    })
    const result = transformInventoryLevel(makeItem(), ll, 'variant_01')
    expect(result.committed).toBeUndefined()
    expect(result.incoming).toBeUndefined()
  })

  it('preserves metadata with both item and location level', () => {
    const item = makeItem()
    const ll = makeLocationLevel()
    const result = transformInventoryLevel(item, ll, 'variant_01')
    const meta = result.metadata as { item: unknown; locationLevel: unknown }
    expect(meta.item).toBe(item)
    expect(meta.locationLevel).toBe(ll)
  })

  it('produces a schema-valid result', () => {
    const result = transformInventoryLevel(makeItem(), makeLocationLevel(), 'variant_01')
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
