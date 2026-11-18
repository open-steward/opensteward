/** Fixture keys are StockModel's documented attribute names (v5.8.0 REST/Models/StockModel.php). */
import { describe, expect, it } from 'vitest'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'
import { transformStockModel } from '../../../../../../../src/verticals/ecommerce/adapters/jtl-shop/transform/stock-model'

const ROW = { productID: 42, warehouseID: 3, stock: 17, procured: 5, procuredDate: null }

describe('transformStockModel', () => {
  it('maps a (product, warehouse) row and parses as an InventoryLevel', () => {
    const l = InventoryLevelSchema.parse(transformStockModel(ROW))
    expect(l).toMatchObject({
      id: '42:3',
      variantId: '42',
      locationId: '3',
      available: 17,
      incoming: 5,
    })
    expect(l.metadata).toEqual(ROW)
  })

  it('refuses a fractional or negative stock instead of rounding it', () => {
    expect(() => transformStockModel({ ...ROW, stock: 2.5 })).toThrow(/not a whole number/)
    expect(() => transformStockModel({ ...ROW, stock: -1 })).toThrow(/not a whole number/)
  })

  it('omits incoming when procured is not a whole count', () => {
    expect(
      InventoryLevelSchema.parse(transformStockModel({ ...ROW, procured: 0.5 })).incoming,
    ).toBeUndefined()
  })
})
