import { describe, it, expect } from 'vitest'
import {
  transformStockLevels,
  type RawXentralProductStocks,
} from '../../../../../../../src/verticals/inventory/adapters/xentral/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

const rawStocks: RawXentralProductStocks = {
  id: 'prod-99',
  totals: {
    physical: 100,
    sellable: 85,
    reserved: 15,
    openSalesOrders: 5,
  },
  warehouses: [
    { id: 'wh-1', physical: 60 },
    { id: 'wh-2', physical: 40 },
  ],
}

describe('xentral transformStockLevels', () => {
  it('emits one StockLevel per warehouse entry', () => {
    const results = transformStockLevels('prod-99', rawStocks)
    expect(results).toHaveLength(2)
  })

  it('maps warehouse id to locationId', () => {
    const results = transformStockLevels('prod-99', rawStocks)
    expect(results[0]!.locationId).toBe('wh-1')
    expect(results[1]!.locationId).toBe('wh-2')
  })

  it('maps warehouse physical quantity to quantityOnHand', () => {
    const results = transformStockLevels('prod-99', rawStocks)
    expect(results[0]!.quantityOnHand).toBe(60)
    expect(results[1]!.quantityOnHand).toBe(40)
  })

  it('builds synthetic id as <productId>:<warehouseId>', () => {
    const results = transformStockLevels('prod-99', rawStocks)
    expect(results[0]!.id).toBe('prod-99:wh-1')
    expect(results[1]!.id).toBe('prod-99:wh-2')
  })

  it('sets productId on all records', () => {
    const results = transformStockLevels('prod-99', rawStocks)
    expect(results.every((r) => r.productId === 'prod-99')).toBe(true)
  })

  it('sets platform=xentral on all records', () => {
    const results = transformStockLevels('prod-99', rawStocks)
    expect(results.every((r) => r.platform === 'xentral')).toBe(true)
  })

  it('produces schema-valid StockLevel records for each warehouse', () => {
    const results = transformStockLevels('prod-99', rawStocks)
    for (const r of results) {
      expect(() => StockLevelSchema.parse(r)).not.toThrow()
    }
  })

  it('emits aggregate record with totals when no warehouses present', () => {
    const results = transformStockLevels('prod-99', { ...rawStocks, warehouses: [] })
    expect(results).toHaveLength(1)
    expect(results[0]!.locationId).toBe('')
    expect(results[0]!.quantityOnHand).toBe(100)
    expect(results[0]!.quantityAvailable).toBe(85)
    expect(results[0]!.quantityCommitted).toBe(15)
  })

  it('aggregate record is also schema-valid', () => {
    const results = transformStockLevels('prod-99', { ...rawStocks, warehouses: [] })
    expect(() => StockLevelSchema.parse(results[0]!)).not.toThrow()
  })
})
