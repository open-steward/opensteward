import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawFBAInventorySummary,
} from '../../../../../../../src/verticals/ecommerce/adapters/amazon-sp/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeSummary(
  overrides: Partial<RawFBAInventorySummary> = {},
): RawFBAInventorySummary {
  return {
    asin: 'B0ABCDE123',
    fnSku: 'X001ABCDEF',
    sellerSku: 'TEE-S-BLUE',
    condition: 'NewItem',
    productName: 'Ocean Blue T-Shirt',
    totalQuantity: 42,
    inventoryDetails: {
      fulfillableQuantity: 40,
      inboundWorkingQuantity: 0,
      inboundShippedQuantity: 5,
      inboundReceivingQuantity: 0,
      reservedQuantity: {
        totalReservedQuantity: 2,
      },
    },
    lastUpdatedTime: '2024-05-01T12:00:00Z',
    ...overrides,
  }
}

describe('transformInventoryLevel (AmazonSP)', () => {
  it('uses the sellerSku as variantId and a synthetic fba-default location', () => {
    const lvl = transformInventoryLevel(makeSummary())
    expect(lvl.id).toBe('TEE-S-BLUE:fba-default')
    expect(lvl.variantId).toBe('TEE-S-BLUE')
    expect(lvl.locationId).toBe('fba-default')
  })

  it('prefers fulfillableQuantity for `available` and aggregates inbound into `incoming`', () => {
    const lvl = transformInventoryLevel(makeSummary())
    expect(lvl.available).toBe(40)
    expect(lvl.committed).toBe(2)
    expect(lvl.incoming).toBe(5)
    expect(lvl.onHand).toBe(42)
  })

  it('falls back to totalQuantity when inventoryDetails are absent', () => {
    const lvl = transformInventoryLevel(
      makeSummary({ inventoryDetails: undefined }),
    )
    expect(lvl.available).toBe(42)
    expect(lvl.incoming).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeSummary()
    const lvl = transformInventoryLevel(raw)
    expect(lvl.metadata).toBe(raw)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const lvl = transformInventoryLevel(makeSummary())
    expect(() => InventoryLevelSchema.parse(lvl)).not.toThrow()
  })
})
