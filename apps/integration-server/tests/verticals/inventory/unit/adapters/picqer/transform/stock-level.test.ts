import { describe, it, expect } from 'vitest'
import { transformStockLevel } from '../../../../../../../src/verticals/inventory/adapters/picqer/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('transformStockLevel — picqer warehouse stock', () => {
  const raw = {
    idproduct: 1001,
    idwarehouse: 3,
    stock: 250,
    reserved: 10,
    reservedbackorders: 3,
    reservedpicklists: 7,
    reservedallocations: 0,
    freestock: 240,
  }
  const result = transformStockLevel(raw)

  it('sets id as productId:warehouseId', () => {
    expect(result.id).toBe('1001:3')
  })

  it('sets productId from idproduct', () => {
    expect(result.productId).toBe('1001')
  })

  it('sets locationId from idwarehouse', () => {
    expect(result.locationId).toBe('3')
  })

  it('sets quantityOnHand from stock', () => {
    expect(result.quantityOnHand).toBe(250)
  })

  it('sets quantityAvailable from freestock', () => {
    expect(result.quantityAvailable).toBe(240)
  })

  it('sets quantityCommitted from reserved', () => {
    expect(result.quantityCommitted).toBe(10)
  })

  it('stores reservedbackorders in metadata', () => {
    expect(result.metadata['reservedbackorders']).toBe('3')
  })

  it('stores reservedpicklists in metadata', () => {
    expect(result.metadata['reservedpicklists']).toBe('7')
  })

  it('sets platform to picqer', () => {
    expect(result.platform).toBe('picqer')
  })

  it('passes schema validation', () => {
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockLevel — minimal input', () => {
  const result = transformStockLevel({ idproduct: 2, idwarehouse: 1, stock: 0 })

  it('sets quantityOnHand to 0', () => {
    expect(result.quantityOnHand).toBe(0)
  })

  it('leaves quantityAvailable undefined when freestock absent', () => {
    expect(result.quantityAvailable).toBeUndefined()
  })

  it('leaves quantityCommitted undefined when reserved absent', () => {
    expect(result.quantityCommitted).toBeUndefined()
  })

  it('passes schema validation', () => {
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
