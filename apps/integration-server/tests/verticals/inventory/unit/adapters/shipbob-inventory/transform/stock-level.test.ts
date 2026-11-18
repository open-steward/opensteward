import { describe, it, expect } from 'vitest'
import {
  flattenStockLevels,
  type RawShipBobInventoryLevel,
} from '../../../../../../../src/verticals/inventory/adapters/shipbob-inventory/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

/**
 * Fixtures follow `GET /2026-01/inventory-level/locations` per ShipBob's
 * OpenAPI document (fetched 2026-09-18): items[] carry inventory_id, name,
 * sku and locations[], and each location carries location_id plus
 * on_hand_quantity, fulfillable_quantity, committed_quantity,
 * awaiting_quantity and internal_transfer_quantity.
 *
 * The plain `/inventory-level` route is deliberately NOT the source: it
 * returns `total_*` quantities summed across every fulfilment centre, and a
 * canonical stock level is per (product, location).
 */
function raw(over: Partial<RawShipBobInventoryLevel> = {}): RawShipBobInventoryLevel {
  return {
    inventory_id: 551,
    name: 'Wireless Keyboard',
    sku: 'WK-2026',
    locations: [
      { location_id: 8, name: 'Cicero (IL)', on_hand_quantity: 40, fulfillable_quantity: 36, committed_quantity: 4, awaiting_quantity: 10 },
      { location_id: 12, name: 'Moreno Valley (CA)', on_hand_quantity: 7, fulfillable_quantity: 7 },
    ],
    ...over,
  }
}

describe('shipbob-inventory stock levels', () => {
  it('produces canonical output that satisfies the schema', () => {
    for (const row of flattenStockLevels(raw())) {
      expect(() => StockLevelSchema.parse(row)).not.toThrow()
    }
  })

  it('emits one row per location, not one per inventory item', () => {
    // The whole reason this reads /inventory-level/locations.
    expect(flattenStockLevels(raw())).toHaveLength(2)
  })

  it('keys each row on the inventory and location together', () => {
    const [first] = flattenStockLevels(raw())
    expect(first!.id).toBe('551:8')
    expect(first!.productId).toBe('551')
    expect(first!.locationId).toBe('8')
  })

  it('maps the per-location quantities', () => {
    const [first] = flattenStockLevels(raw())
    expect(first!.quantityOnHand).toBe(40)
    expect(first!.quantityAvailable).toBe(36)
    expect(first!.quantityCommitted).toBe(4)
    expect(first!.quantityIncoming).toBe(10)
  })

  it('does not report stock in transit between centres as committed to fulfilment', () => {
    // The canonical `quantityOutgoing` is "committed to fulfilment". ShipBob's
    // `internal_transfer_quantity` is stock moving between its OWN centres —
    // not leaving the network, not for an order — and it has no per-location
    // equivalent of the canonical field. It used to fill `quantityOutgoing`;
    // every sandbox value was 0, so the wrong meaning had not shown yet.
    const [row] = flattenStockLevels(
      raw({ locations: [{ location_id: 80, on_hand_quantity: 40, internal_transfer_quantity: 12 }] }),
    )
    expect(row!.quantityOutgoing).toBeUndefined()
  })

  it('never attributes one location a network-wide total', () => {
    // 40 + 7 across two centres; neither row may claim 47.
    const rows = flattenStockLevels(raw())
    expect(rows.map((r) => r.quantityOnHand)).toEqual([40, 7])
  })

  it('drops a location with no id rather than emitting an unkeyed row', () => {
    const rows = flattenStockLevels(raw({ locations: [{ on_hand_quantity: 5 }] }))
    expect(rows).toHaveLength(0)
  })

  it('returns nothing for an item stocked nowhere', () => {
    expect(flattenStockLevels(raw({ locations: [] }))).toEqual([])
  })
})

describe('shipbob-inventory stock levels — a verbatim live payload', () => {
  /**
   * Copied byte-for-byte from a live ShipBob sandbox response
   * (GET /2026-01/inventory-level/16160673/locations, 2026-09-18). Two fields
   * the OpenAPI document does not mention — quarantine_quantity and
   * damaged_quantity — arrive on every location and must not break the
   * transform.
   *
   * This item is why the adapter reads the per-location route: all 238 units
   * on hand sit at one centre while 432 more are awaiting arrival spread
   * across four hubs. A network total would report a single row of 238 on hand
   * against no location at all.
   */
  const LIVE: RawShipBobInventoryLevel = {
    name: 'Classic Tee - Black / Small',
    sku: 'DEMO-TEE-BLK-S',
    inventory_id: 16160673,
    locations: [
      { location_id: 9, name: 'Bethlehem (PA)', fulfillable_quantity: 0, on_hand_quantity: 0, committed_quantity: 0, awaiting_quantity: 0, internal_transfer_quantity: 0, quarantine_quantity: 0, damaged_quantity: 0 },
      { location_id: 10, name: 'Moreno Valley (CA)', fulfillable_quantity: 238, on_hand_quantity: 238, committed_quantity: 0, awaiting_quantity: 0, internal_transfer_quantity: 0, quarantine_quantity: 0, damaged_quantity: 0 },
      { location_id: 80, name: 'US (CA) West Hub 1', fulfillable_quantity: 0, on_hand_quantity: 0, committed_quantity: 0, awaiting_quantity: 120, internal_transfer_quantity: 0, quarantine_quantity: 0, damaged_quantity: 0 },
      { location_id: 81, name: 'US (IL) Midwest Hub 1', fulfillable_quantity: 0, on_hand_quantity: 0, committed_quantity: 0, awaiting_quantity: 82, internal_transfer_quantity: 0, quarantine_quantity: 0, damaged_quantity: 0 },
      { location_id: 82, name: 'US (PA) Northeast Hub 1', fulfillable_quantity: 0, on_hand_quantity: 0, committed_quantity: 0, awaiting_quantity: 111, internal_transfer_quantity: 0, quarantine_quantity: 0, damaged_quantity: 0 },
      { location_id: 83, name: 'US (TX) Southwest Hub 1', fulfillable_quantity: 0, on_hand_quantity: 0, committed_quantity: 0, awaiting_quantity: 119, internal_transfer_quantity: 0, quarantine_quantity: 0, damaged_quantity: 0 },
    ],
  }

  it('maps every row of the real response to a valid canonical stock level', () => {
    const rows = flattenStockLevels(LIVE)
    expect(rows).toHaveLength(6)
    for (const row of rows) expect(() => StockLevelSchema.parse(row)).not.toThrow()
  })

  it('keeps the 238 units where they physically are', () => {
    const rows = flattenStockLevels(LIVE)
    const stocked = rows.filter((r) => r.quantityOnHand > 0)
    expect(stocked).toHaveLength(1)
    expect(stocked[0]!.locationId).toBe('10')
    expect(stocked[0]!.quantityOnHand).toBe(238)
  })

  it('spreads inbound stock across the four hubs it is actually arriving at', () => {
    const incoming = flattenStockLevels(LIVE)
      .filter((r) => (r.quantityIncoming ?? 0) > 0)
      .map((r) => [r.locationId, r.quantityIncoming])
    expect(incoming).toEqual([['80', 120], ['81', 82], ['82', 111], ['83', 119]])
  })

  it('does not choke on quantity fields the document never mentions', () => {
    // quarantine_quantity and damaged_quantity are live-only; they survive on
    // raw rather than being dropped or throwing.
    expect(flattenStockLevels(LIVE)[1]!.raw).toMatchObject({
      location: expect.objectContaining({ quarantine_quantity: 0, damaged_quantity: 0 }),
    })
  })
})
