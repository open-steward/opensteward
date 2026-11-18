import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawRevelIngredient,
} from '../../../../../../../src/verticals/inventory/adapters/revel-systems/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('revel-systems transformStockLevel', () => {
  const raw: RawRevelIngredient = {
    id: 20,
    name: 'Ground Beef',
    quantity: 15.5,
    par_level: 10,
    reorder_qty: 50,
    in_stock: true,
    establishment: '/resources/Establishment/5/',
    cost: 8.99,
    updated_date: '2024-03-01T00:00:00Z',
  }

  it('constructs synthetic id as productId:locationId', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('20:5')
    expect(result.productId).toBe('20')
    expect(result.locationId).toBe('5')
  })

  it('extracts locationId from establishment URI', () => {
    const result = transformStockLevel(raw)
    expect(result.locationId).toBe('5')
  })

  it('maps quantityOnHand from quantity', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(15.5)
  })

  it('maps reorderPoint from par_level', () => {
    const result = transformStockLevel(raw)
    expect(result.reorderPoint).toBe(10)
  })

  it('maps reorderQuantity from reorder_qty', () => {
    const result = transformStockLevel(raw)
    expect(result.reorderQuantity).toBe(50)
  })

  it('handles establishment as integer', () => {
    const result = transformStockLevel({ ...raw, establishment: 5 })
    expect(result.locationId).toBe('5')
    expect(result.id).toBe('20:5')
  })

  it('defaults quantityOnHand to 0 when quantity is null', () => {
    const result = transformStockLevel({ ...raw, quantity: null })
    expect(result.quantityOnHand).toBe(0)
  })

  it('sets quantityAvailable/Committed/Incoming to undefined', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityAvailable).toBeUndefined()
    expect(result.quantityCommitted).toBeUndefined()
    expect(result.quantityIncoming).toBeUndefined()
  })

  it('stores name and cost in metadata', () => {
    const result = transformStockLevel(raw)
    expect(result.metadata['name']).toBe('Ground Beef')
    expect(result.metadata['cost']).toBe('8.99')
  })

  it('produces output that satisfies StockLevelSchema', () => {
    const result = transformStockLevel(raw)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
