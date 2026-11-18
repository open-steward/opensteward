import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawFulfilStockLevel,
} from '../../../../../../../src/verticals/inventory/adapters/fulfil-io/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('transformStockLevel — fulfil-io', () => {
  const raw: RawFulfilStockLevel = {
    id: 400,
    product: [55, 'Widget'],
    location: [12, 'Main Storage'],
    quantity: 250,
    forecast_quantity: 230,
    create_date: '2024-03-01T00:00:00Z',
    write_date: '2024-03-01T00:00:00Z',
  }
  const result = transformStockLevel(raw)

  it('builds composite id from productId and locationId', () => {
    expect(result.id).toBe('55:12')
  })

  it('maps productId from product m2o id', () => {
    expect(result.productId).toBe('55')
  })

  it('maps locationId from location m2o id', () => {
    expect(result.locationId).toBe('12')
  })

  it('maps quantityOnHand from quantity', () => {
    expect(result.quantityOnHand).toBe(250)
  })

  it('maps quantityAvailable from forecast_quantity', () => {
    expect(result.quantityAvailable).toBe(230)
  })

  it('sets platform to fulfil-io', () => {
    expect(result.platform).toBe('fulfil-io')
  })

  it('passes schema validation', () => {
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockLevel — fulfil-io null quantities', () => {
  const raw: RawFulfilStockLevel = {
    id: 401,
    product: [56, 'Gadget'],
    location: [13, 'Secondary'],
    quantity: null,
    forecast_quantity: null,
  }
  const result = transformStockLevel(raw)

  it('defaults quantityOnHand to 0 when quantity is null', () => {
    expect(result.quantityOnHand).toBe(0)
  })

  it('maps quantityAvailable to undefined when forecast_quantity is null', () => {
    expect(result.quantityAvailable).toBeUndefined()
  })

  it('passes schema validation', () => {
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
