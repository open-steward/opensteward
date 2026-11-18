import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawInvenTreeStockItem,
} from '../../../../../../../src/verticals/inventory/adapters/inventree/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('transformStockLevel — inventree stock item', () => {
  const raw: RawInvenTreeStockItem = {
    pk: 200,
    part: 42,
    location: 7,
    location_name: 'Shelf A',
    quantity: 100,
    allocated: 10,
    serial: null,
    batch: 'BATCH-001',
    status: 10,
    status_text: 'OK',
    stocktake_date: '2024-03-01T00:00:00Z',
    updated: '2024-03-01T00:00:00Z',
    expiry_date: null,
  }
  const result = transformStockLevel(raw)

  it('sets id from pk', () => {
    expect(result.id).toBe('200')
  })

  it('sets productId from part', () => {
    expect(result.productId).toBe('42')
  })

  it('sets locationId from location', () => {
    expect(result.locationId).toBe('7')
  })

  it('sets quantityOnHand from quantity', () => {
    expect(result.quantityOnHand).toBe(100)
  })

  it('sets quantityAvailable = quantity - allocated', () => {
    expect(result.quantityAvailable).toBe(90)
  })

  it('sets quantityCommitted from allocated', () => {
    expect(result.quantityCommitted).toBe(10)
  })

  it('sets lastCountedAt from stocktake_date', () => {
    expect(result.lastCountedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to inventree', () => {
    expect(result.platform).toBe('inventree')
  })

  it('passes schema validation', () => {
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockLevel — no allocation', () => {
  const raw: RawInvenTreeStockItem = {
    pk: 201,
    part: 55,
    location: null,
    quantity: 50,
  }
  const result = transformStockLevel(raw)

  it('sets empty locationId when location is null', () => {
    expect(result.locationId).toBe('')
  })

  it('sets quantityAvailable to undefined when no allocated field', () => {
    expect(result.quantityAvailable).toBeUndefined()
  })

  it('passes schema validation', () => {
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
