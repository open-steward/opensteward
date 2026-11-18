import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawSkulabsInventoryItem,
} from '../../../../../../../src/verticals/inventory/adapters/skulabs/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('skulabs transformStockLevel', () => {
  const raw: RawSkulabsInventoryItem = {
    item_id: 'item-abc',
    location_id: 'loc-001',
    on_hand: 250,
    inbound: 100,
    alert: 50,
  }

  it('builds synthetic id as "<item_id>:<location_id>"', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('item-abc:loc-001')
  })

  it('maps item_id to productId', () => {
    const result = transformStockLevel(raw)
    expect(result.productId).toBe('item-abc')
  })

  it('maps location_id to locationId', () => {
    const result = transformStockLevel(raw)
    expect(result.locationId).toBe('loc-001')
  })

  it('maps on_hand to quantityOnHand', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(250)
  })

  it('maps inbound to quantityIncoming', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityIncoming).toBe(100)
  })

  it('maps alert to reorderPoint', () => {
    const result = transformStockLevel(raw)
    expect(result.reorderPoint).toBe(50)
  })

  it('defaults quantityOnHand to 0 when on_hand absent', () => {
    const noOnHand: RawSkulabsInventoryItem = { item_id: 'x', location_id: 'y' }
    expect(transformStockLevel(noOnHand).quantityOnHand).toBe(0)
  })

  it('sets quantityIncoming to undefined when inbound is null', () => {
    const nullInbound: RawSkulabsInventoryItem = { ...raw, inbound: null }
    expect(transformStockLevel(nullInbound).quantityIncoming).toBeUndefined()
  })

  it('uses empty string locationId when location_id absent', () => {
    const noLoc: RawSkulabsInventoryItem = { item_id: 'item-x' }
    expect(transformStockLevel(noLoc).locationId).toBe('')
  })

  it('satisfies StockLevelSchema', () => {
    expect(() => StockLevelSchema.parse(transformStockLevel(raw))).not.toThrow()
  })
})
