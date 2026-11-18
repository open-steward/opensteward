import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawEZOStockLevel,
} from '../../../../../../../src/verticals/inventory/adapters/ezofficeinventory/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('transformStockLevel — ezofficeinventory', () => {
  const raw: RawEZOStockLevel = {
    inventory_id: 10,
    location_id: 3,
    location_name: 'Shelf A',
    quantity: 50,
    minimum_quantity: 10,
    optimal_quantity: 100,
    updated_at: '2024-03-01T00:00:00Z',
  }
  const result = transformStockLevel(raw)

  it('builds composite id from inventory_id and location_id', () => {
    expect(result.id).toBe('10:3')
  })

  it('maps productId from inventory_id as string', () => {
    expect(result.productId).toBe('10')
  })

  it('maps locationId from location_id as string', () => {
    expect(result.locationId).toBe('3')
  })

  it('maps quantityOnHand from quantity', () => {
    expect(result.quantityOnHand).toBe(50)
  })

  it('maps reorderPoint from minimum_quantity', () => {
    expect(result.reorderPoint).toBe(10)
  })

  it('maps reorderQuantity from optimal_quantity', () => {
    expect(result.reorderQuantity).toBe(100)
  })

  it('maps lastCountedAt from updated_at', () => {
    expect(result.lastCountedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to ezofficeinventory', () => {
    expect(result.platform).toBe('ezofficeinventory')
  })

  it('passes schema validation', () => {
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockLevel — ezofficeinventory defaults', () => {
  const raw: RawEZOStockLevel = { inventory_id: 5, location_id: 1 }
  const result = transformStockLevel(raw)

  it('defaults quantityOnHand to 0 when quantity absent', () => {
    expect(result.quantityOnHand).toBe(0)
  })

  it('leaves reorderPoint undefined when minimum_quantity absent', () => {
    expect(result.reorderPoint).toBeUndefined()
  })

  it('passes schema validation', () => {
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
