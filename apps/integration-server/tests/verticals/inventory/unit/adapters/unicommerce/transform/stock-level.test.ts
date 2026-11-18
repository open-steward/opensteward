import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawUnicommerceInventorySnapshot,
} from '../../../../../../../src/verticals/inventory/adapters/unicommerce/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

function makeRaw(
  overrides: Partial<RawUnicommerceInventorySnapshot> = {},
): RawUnicommerceInventorySnapshot {
  return {
    itemTypeSKU: 'SKU-001',
    facilityCode: 'WH-DELHI',
    inventory: 250,
    openSale: 10,
    openPurchase: 50,
    putawayPending: 20,
    inventoryBlocked: 5,
    pendingStockTransfer: 0,
    vendorInventory: 0,
    virtualInventory: 0,
    pendingInventoryAssessment: 0,
    ...overrides,
  }
}

describe('transformStockLevel (unicommerce)', () => {
  it('constructs id as sku:facilityCode', () => {
    const result = transformStockLevel(
      makeRaw({ itemTypeSKU: 'SKU-001', facilityCode: 'WH-DELHI' }),
    )
    expect(result.id).toBe('SKU-001:WH-DELHI')
  })

  it('uses "all" as locationId when facilityCode is absent', () => {
    const result = transformStockLevel(makeRaw({ facilityCode: undefined }))
    expect(result.locationId).toBe('all')
    expect(result.id).toBe('SKU-001:all')
  })

  it('maps productId from itemTypeSKU', () => {
    const result = transformStockLevel(makeRaw({ itemTypeSKU: 'SKU-001' }))
    expect(result.productId).toBe('SKU-001')
  })

  it('maps locationId from facilityCode', () => {
    const result = transformStockLevel(makeRaw({ facilityCode: 'WH-DELHI' }))
    expect(result.locationId).toBe('WH-DELHI')
  })

  it('maps quantityOnHand from inventory', () => {
    const result = transformStockLevel(makeRaw({ inventory: 250 }))
    expect(result.quantityOnHand).toBe(250)
  })

  it('maps quantityCommitted from openSale', () => {
    const result = transformStockLevel(makeRaw({ openSale: 10 }))
    expect(result.quantityCommitted).toBe(10)
  })

  it('computes quantityAvailable = inventory - openSale - inventoryBlocked', () => {
    // 250 - 10 - 5 = 235
    const result = transformStockLevel(
      makeRaw({ inventory: 250, openSale: 10, inventoryBlocked: 5 }),
    )
    expect(result.quantityAvailable).toBe(235)
  })

  it('clamps quantityAvailable to 0 when calculation goes negative', () => {
    const result = transformStockLevel(makeRaw({ inventory: 5, openSale: 10, inventoryBlocked: 0 }))
    expect(result.quantityAvailable).toBe(0)
  })

  it('computes quantityIncoming = openPurchase + putawayPending when > 0', () => {
    // 50 + 20 = 70
    const result = transformStockLevel(makeRaw({ openPurchase: 50, putawayPending: 20 }))
    expect(result.quantityIncoming).toBe(70)
  })

  it('omits quantityIncoming when openPurchase + putawayPending = 0', () => {
    const result = transformStockLevel(makeRaw({ openPurchase: 0, putawayPending: 0 }))
    expect(result.quantityIncoming).toBeUndefined()
  })

  it('omits quantityIncoming when both fields are absent', () => {
    const result = transformStockLevel(
      makeRaw({ openPurchase: undefined, putawayPending: undefined }),
    )
    expect(result.quantityIncoming).toBeUndefined()
  })

  it('defaults inventory fields to 0 when absent', () => {
    const result = transformStockLevel({})
    expect(result.quantityOnHand).toBe(0)
    expect(result.quantityCommitted).toBe(0)
    expect(result.quantityAvailable).toBe(0)
  })

  it('platform is "unicommerce"', () => {
    expect(transformStockLevel(makeRaw()).platform).toBe('unicommerce')
  })

  it('passes StockLevelSchema validation', () => {
    const result = transformStockLevel(makeRaw())
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
