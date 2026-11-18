/**
 * Haravan InventoryLevel transform — used ONLY on the write path (see
 * index.ts / metadata.ts): `inventory_advance` is a shop-wide aggregate with
 * no per-location breakdown, so `listInventoryLevels`/`getInventoryLevel` are
 * unavailable and this only runs on the caller-supplied `locationId` from an
 * adjust/set call.
 */
import { describe, it, expect } from 'vitest'
import { transformInventoryLevel } from '../../../../../../../src/verticals/ecommerce/adapters/haravan/transform/inventory'
import type { RawHaravanVariant } from '../../../../../../../src/verticals/ecommerce/adapters/haravan/transform/product'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeVariant(overrides: Partial<RawHaravanVariant> = {}): RawHaravanVariant {
  return {
    id: 1061514767,
    product_id: 1028183686,
    inventory_advance: { qty_available: 23, qty_onhand: 47, qty_commited: 24, qty_incoming: 0 },
    updated_at: '2021-11-26T06:23:12.986Z',
    ...overrides,
  }
}

describe('transformInventoryLevel (haravan)', () => {
  it('maps available/committed/incoming/onHand from inventory_advance', () => {
    const result = transformInventoryLevel(makeVariant(), 'loc_991324')
    expect(result.variantId).toBe('1061514767')
    expect(result.locationId).toBe('loc_991324')
    expect(result.available).toBe(23)
    expect(result.committed).toBe(24)
    expect(result.incoming).toBe(0)
    expect(result.onHand).toBe(47)
  })

  it('falls back to inventory_quantity when inventory_advance is null', () => {
    const result = transformInventoryLevel(
      makeVariant({ inventory_advance: null, inventory_quantity: 5 }),
      'loc_991324',
    )
    expect(result.available).toBe(5)
  })

  it('throws rather than inventing a 0 when neither field is present', () => {
    expect(() =>
      transformInventoryLevel(makeVariant({ inventory_advance: null, inventory_quantity: undefined }), 'loc_991324'),
    ).toThrow()
  })

  it('never fabricates the locationId — it always comes from the caller', () => {
    const result = transformInventoryLevel(makeVariant(), 'loc_abc')
    expect(result.locationId).toBe('loc_abc')
    expect(result.id).toBe('1061514767:loc_abc')
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    expect(() => InventoryLevelSchema.parse(transformInventoryLevel(makeVariant(), 'loc_991324'))).not.toThrow()
  })
})
