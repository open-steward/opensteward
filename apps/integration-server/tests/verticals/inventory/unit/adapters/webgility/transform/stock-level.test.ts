import { describe, it, expect } from 'vitest'
import { transformStockLevel } from '../../../../../../../src/verticals/inventory/adapters/webgility/transform/stock-level'
import type { RawWebgilityItem } from '../../../../../../../src/verticals/inventory/adapters/webgility/transform/product'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

const rawItem: RawWebgilityItem = {
  ItemId: 'item-123',
  ItemCode: 'SKU-ABC',
  ItemName: 'Blue Widget',
  TrackInventory: true,
  QBQtyOnHand: 75,
}

describe('webgility transformStockLevel', () => {
  it('builds synthetic id as <ItemId>:default', () => {
    const result = transformStockLevel(rawItem)
    expect(result.id).toBe('item-123:default')
  })

  it('maps ItemId to productId and externalId', () => {
    const result = transformStockLevel(rawItem)
    expect(result.productId).toBe('item-123')
    expect(result.externalId).toBe('item-123')
  })

  it('sets locationId to "default"', () => {
    const result = transformStockLevel(rawItem)
    expect(result.locationId).toBe('default')
  })

  it('maps QBQtyOnHand to quantityOnHand', () => {
    const result = transformStockLevel(rawItem)
    expect(result.quantityOnHand).toBe(75)
  })

  it('defaults quantityOnHand to 0 when QBQtyOnHand is absent', () => {
    const result = transformStockLevel({ ...rawItem, QBQtyOnHand: undefined })
    expect(result.quantityOnHand).toBe(0)
  })

  it('sets platform=webgility', () => {
    const result = transformStockLevel(rawItem)
    expect(result.platform).toBe('webgility')
  })

  it('stores TrackInventory in metadata', () => {
    const result = transformStockLevel(rawItem)
    expect(result.metadata['trackInventory']).toBe('true')
  })

  it('produces a schema-valid StockLevel', () => {
    const result = transformStockLevel(rawItem)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
