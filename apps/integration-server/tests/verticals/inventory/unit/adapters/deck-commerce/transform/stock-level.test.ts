import { describe, it, expect } from 'vitest'
import {
  expandStockLevels,
  type RawDeckCommerceStockLevel,
} from '../../../../../../../src/verticals/inventory/adapters/deck-commerce/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('deck-commerce expandStockLevels', () => {
  const raw: RawDeckCommerceStockLevel = {
    DeckSKU: 'DC-SKU-001',
    TotalAvailableQuantity: 80,
    Details: [
      { WarehouseCode: 'WH1', TotalQuantity: 50, InventoryAllocation: 8 },
      { WarehouseCode: 'WH2', TotalQuantity: 30, InventoryAllocation: 2 },
    ],
  }

  it('emits one StockLevel per Details entry', () => {
    const results = expandStockLevels(raw)
    expect(results).toHaveLength(2)
  })

  it('builds composite id from DeckSKU and WarehouseCode', () => {
    const results = expandStockLevels(raw)
    expect(results[0].id).toBe('DC-SKU-001:WH1')
    expect(results[1].id).toBe('DC-SKU-001:WH2')
  })

  it('maps productId from DeckSKU', () => {
    const results = expandStockLevels(raw)
    expect(results[0].productId).toBe('DC-SKU-001')
  })

  it('maps locationId from WarehouseCode', () => {
    const results = expandStockLevels(raw)
    expect(results[0].locationId).toBe('WH1')
    expect(results[1].locationId).toBe('WH2')
  })

  it('maps quantityOnHand from TotalQuantity', () => {
    const results = expandStockLevels(raw)
    expect(results[0].quantityOnHand).toBe(50)
  })

  it('calculates quantityAvailable as TotalQuantity minus InventoryAllocation', () => {
    const results = expandStockLevels(raw)
    expect(results[0].quantityAvailable).toBe(42) // 50 - 8
    expect(results[1].quantityAvailable).toBe(28) // 30 - 2
  })

  it('maps quantityCommitted from InventoryAllocation', () => {
    const results = expandStockLevels(raw)
    expect(results[0].quantityCommitted).toBe(8)
  })

  it('reports quantityAvailable as TotalQuantity minus InventoryAllocation even when negative, as the vendor client does', () => {
    const result = expandStockLevels({
      DeckSKU: 'DC-SKU-002',
      TotalAvailableQuantity: 0,
      Details: [{ WarehouseCode: 'WH1', TotalQuantity: 5, InventoryAllocation: 20 }],
    })
    expect(result[0].quantityAvailable).toBe(-15)
  })

  it.each([undefined, []])(
    'throws rather than use TotalAvailableQuantity as on-hand when Details is %o',
    (details) => {
      expect(() =>
        expandStockLevels({ DeckSKU: 'DC-SKU-003', TotalAvailableQuantity: 55, Details: details }),
      ).toThrow(/DC-SKU-003 has no warehouse Details/)
    },
  )

  it('sets platform to deck-commerce on all results', () => {
    const results = expandStockLevels(raw)
    for (const r of results) {
      expect(r.platform).toBe('deck-commerce')
    }
  })

  it('produces output that satisfies StockLevelSchema for each entry', () => {
    const results = expandStockLevels(raw)
    for (const r of results) {
      expect(() => StockLevelSchema.parse(r)).not.toThrow()
    }
  })
})

describe('deck-commerce expandStockLevels without the documented fields', () => {
  it('skips an item without TotalAvailableQuantity, as the vendor client does', () => {
    expect(expandStockLevels({ DeckSKU: 'DC-SKU-004' })).toEqual([])
  })

  it.each([{}, { DeckSKU: '' }])('throws on an item without DeckSKU (%o)', (item) => {
    expect(() =>
      expandStockLevels({
        ...item,
        TotalAvailableQuantity: 7,
        Details: [{ WarehouseCode: 'WH1', TotalQuantity: 7, InventoryAllocation: 0 }],
      } as RawDeckCommerceStockLevel),
    ).toThrow(/has no DeckSKU/)
  })

  it.each([
    [{ WarehouseCode: 'WH1', InventoryAllocation: 1 }, /TotalQuantity/],
    [{ WarehouseCode: 'WH1', TotalQuantity: 3 }, /InventoryAllocation/],
    [{ TotalQuantity: 3, InventoryAllocation: 1 }, /WarehouseCode/],
  ])('throws rather than invent a missing detail field (%o)', (detail, message) => {
    expect(() =>
      expandStockLevels({ DeckSKU: 'DC-SKU-006', TotalAvailableQuantity: 2, Details: [detail] }),
    ).toThrow(message)
  })
})
