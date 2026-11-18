import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  aggregateInventoryLevels,
  type RawSharetribeStockAdjustment,
} from '../../../../../../../src/verticals/ecommerce/adapters/sharetribe/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeAdjustment(overrides: Partial<RawSharetribeStockAdjustment> = {}): RawSharetribeStockAdjustment {
  return {
    id: { uuid: 'adj-001' },
    type: 'stockAdjustment',
    attributes: {
      quantity: 10,
      createdAt: '2026-01-15T09:30:00.000Z',
    },
    relationships: {
      listing: { data: { uuid: 'listing-001' } },
      stockReservation: { data: null },
    },
    ...overrides,
  }
}

// ── transformStockAdjustment ──────────────────────────────────────────────────

describe('transformStockAdjustment (Sharetribe)', () => {
  it('synthesises composite id as listingId:locationId', () => {
    const result = transformStockAdjustment(makeAdjustment())
    expect(result.id).toBe('listing-001:listing:listing-001')
  })

  it('sets variantId from listing uuid', () => {
    const result = transformStockAdjustment(makeAdjustment())
    expect(result.variantId).toBe('listing-001')
  })

  it('sets locationId as listing:<listingId>', () => {
    const result = transformStockAdjustment(makeAdjustment())
    expect(result.locationId).toBe('listing:listing-001')
  })

  it('uses quantity as available (positive delta)', () => {
    const result = transformStockAdjustment(makeAdjustment())
    expect(result.available).toBe(10)
  })

  it('clamps negative quantity to 0 for available', () => {
    const result = transformStockAdjustment(makeAdjustment({ attributes: { quantity: -5 } }))
    expect(result.available).toBe(0)
  })

  it('stores raw quantity delta in metadata', () => {
    const result = transformStockAdjustment(makeAdjustment())
    expect(result.metadata['rawQuantityDelta']).toBe(10)
  })

  it('stores adjustmentId in metadata', () => {
    const result = transformStockAdjustment(makeAdjustment())
    expect(result.metadata['adjustmentId']).toBe('adj-001')
  })

  it('maps updatedAt from createdAt', () => {
    const result = transformStockAdjustment(makeAdjustment())
    expect(result.updatedAt).toBe('2026-01-15T09:30:00.000Z')
  })

  it('produces a payload satisfying InventoryLevelSchema', () => {
    const result = transformStockAdjustment(makeAdjustment())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})

// ── aggregateInventoryLevels ──────────────────────────────────────────────────

describe('aggregateInventoryLevels (Sharetribe)', () => {
  it('sums all adjustment quantities', () => {
    const adjustments = [
      makeAdjustment({ attributes: { quantity: 10, createdAt: '2026-01-10T00:00:00.000Z' } }),
      makeAdjustment({ id: { uuid: 'adj-002' }, attributes: { quantity: 5, createdAt: '2026-01-15T00:00:00.000Z' } }),
      makeAdjustment({ id: { uuid: 'adj-003' }, attributes: { quantity: -3, createdAt: '2026-01-12T00:00:00.000Z' } }),
    ]
    const result = aggregateInventoryLevels(adjustments, 'listing-001')
    expect(result.available).toBe(12) // 10 + 5 - 3
  })

  it('clamps negative totals to 0', () => {
    const adjustments = [
      makeAdjustment({ attributes: { quantity: -20 } }),
    ]
    const result = aggregateInventoryLevels(adjustments, 'listing-001')
    expect(result.available).toBe(0)
  })

  it('sets updatedAt to the most recent adjustment', () => {
    const adjustments = [
      makeAdjustment({ attributes: { quantity: 5, createdAt: '2026-01-10T00:00:00.000Z' } }),
      makeAdjustment({ id: { uuid: 'adj-002' }, attributes: { quantity: 3, createdAt: '2026-01-20T00:00:00.000Z' } }),
    ]
    const result = aggregateInventoryLevels(adjustments, 'listing-001')
    expect(result.updatedAt).toBe('2026-01-20T00:00:00.000Z')
  })

  it('stores adjustmentCount in metadata', () => {
    const adjustments = [makeAdjustment(), makeAdjustment({ id: { uuid: 'adj-002' } })]
    const result = aggregateInventoryLevels(adjustments, 'listing-001')
    expect(result.metadata['adjustmentCount']).toBe(2)
  })

  it('produces a payload satisfying InventoryLevelSchema', () => {
    const result = aggregateInventoryLevels([makeAdjustment()], 'listing-001')
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
