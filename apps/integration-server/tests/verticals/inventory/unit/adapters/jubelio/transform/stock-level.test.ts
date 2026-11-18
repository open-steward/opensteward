import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawJubelioStockLevel,
} from '../../../../../../../src/verticals/inventory/adapters/jubelio/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('transformStockLevel — jubelio', () => {
  const raw: RawJubelioStockLevel = {
    item_id: 100,
    location_id: 5,
    location_name: 'Main Warehouse',
    quantity: 200,
    available: 180,
    committed: 20,
    incoming: 50,
    reorder_point: 30,
    reorder_qty: 100,
  }
  const result = transformStockLevel(raw)

  it('sets synthetic id as productId:locationId', () => {
    expect(result.id).toBe('100:5')
  })

  it('sets productId from item_id', () => {
    expect(result.productId).toBe('100')
  })

  it('sets locationId from location_id', () => {
    expect(result.locationId).toBe('5')
  })

  it('sets quantityOnHand from quantity', () => {
    expect(result.quantityOnHand).toBe(200)
  })

  it('sets quantityAvailable from available', () => {
    expect(result.quantityAvailable).toBe(180)
  })

  it('sets quantityCommitted from committed', () => {
    expect(result.quantityCommitted).toBe(20)
  })

  it('sets quantityIncoming from incoming', () => {
    expect(result.quantityIncoming).toBe(50)
  })

  it('sets reorderPoint from reorder_point', () => {
    expect(result.reorderPoint).toBe(30)
  })

  it('sets reorderQuantity from reorder_qty', () => {
    expect(result.reorderQuantity).toBe(100)
  })

  it('sets platform to jubelio', () => {
    expect(result.platform).toBe('jubelio')
  })

  it('passes schema validation', () => {
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockLevel — no location_id', () => {
  const raw: RawJubelioStockLevel = {
    item_id: '999',
    quantity: 10,
  }
  const result = transformStockLevel(raw)

  it('sets empty locationId when location_id absent', () => {
    expect(result.locationId).toBe('')
  })

  it('sets synthetic id with empty locationId', () => {
    expect(result.id).toBe('999:')
  })

  it('passes schema validation', () => {
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
