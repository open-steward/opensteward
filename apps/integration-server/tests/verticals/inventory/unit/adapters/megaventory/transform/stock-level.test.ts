import { describe, it, expect } from 'vitest'
import {
  flattenStockLevels,
  type RawMegaventoryProductStock,
} from '../../../../../../../src/verticals/inventory/adapters/megaventory/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

/**
 * `InventoryLocationStockGet` returns a NESTED shape — one entry per product,
 * each carrying an `mvStock[]` of per-location rows. Copied from the live
 * service metadata example, 2026-09-18.
 *
 * Note `productID` is lower-cased here while `ProductGet` returns
 * `ProductID`. That inconsistency is the service's.
 */
function raw(over: Partial<RawMegaventoryProductStock> = {}): RawMegaventoryProductStock {
  return {
    productID: 51,
    mvStock: [
      {
        InventoryLocationID: 4,
        StockPhysical: 260,
        StockOnHold: 10,
        StockNonShipped: 6,
        StockNonReceivedPOs: 100,
        StockOnHand: 250,
        StockAlertLevel: 50,
        SubLocation: 'A-12',
        InventoryLocationStockLastUpdatedDate: '/Date(1504777176817-0000)/',
      },
      {
        InventoryLocationID: 9,
        StockOnHold: 0,
        StockOnHand: 40,
        StockNonReceivedPOs: 0,
      },
    ],
    ...over,
  }
}

describe('megaventory stock levels', () => {
  it('produces canonical output that satisfies the schema', () => {
    for (const row of flattenStockLevels(raw())) {
      expect(() => StockLevelSchema.parse(row)).not.toThrow()
    }
  })

  it('flattens the nested response to one row per location', () => {
    expect(flattenStockLevels(raw())).toHaveLength(2)
  })

  it('keys each row on the product and location together', () => {
    const [first] = flattenStockLevels(raw())
    expect(first!.id).toBe('51:4')
    expect(first!.productId).toBe('51')
    expect(first!.locationId).toBe('4')
  })

  it('reports StockOnHand as on hand, not StockPhysical', () => {
    // 260 is in the building; 250 is the stock position Megaventory itself
    // treats as on-hand.
    const [first] = flattenStockLevels(raw())
    expect(first!.quantityOnHand).toBe(250)
    expect(first!.metadata['StockPhysical']).toBe('260')
  })

  it('derives available as on-hand minus held', () => {
    const [first] = flattenStockLevels(raw())
    expect(first!.quantityCommitted).toBe(10)
    expect(first!.quantityAvailable).toBe(240)
  })

  it('maps incoming from unreceived POs and outgoing from unshipped sales', () => {
    const [first] = flattenStockLevels(raw())
    expect(first!.quantityIncoming).toBe(100)
    expect(first!.quantityOutgoing).toBe(6)
  })

  it('carries the alert level as the reorder point', () => {
    expect(flattenStockLevels(raw())[0]!.reorderPoint).toBe(50)
  })

  it('does not report a record update as a physical stock count', () => {
    // InventoryLocationStockLastUpdatedDate is when the row changed, not when
    // anyone counted. Mapping it to lastCountedAt reports every write as a
    // stocktake.
    const [first] = flattenStockLevels(raw())
    expect(first!.lastCountedAt).toBeUndefined()
    expect(first!.metadata['InventoryLocationStockLastUpdatedDate']).toBe(
      '2017-09-07T09:39:36.817Z',
    )
  })

  it('drops a stock row with no location rather than emitting an unkeyed row', () => {
    expect(flattenStockLevels(raw({ mvStock: [{ StockOnHand: 5 }] }))).toHaveLength(0)
  })

  it('returns nothing for a product stocked nowhere', () => {
    expect(flattenStockLevels(raw({ mvStock: [] }))).toEqual([])
    expect(flattenStockLevels(raw({ mvStock: null }))).toEqual([])
  })
})
