/** stock.quant rows; fields from addons/stock/models/stock_quant.py, 19.0. */
import { describe, expect, it } from 'vitest'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'
import { transformStockLevel } from '../../../../../../../src/verticals/inventory/adapters/odoo-inventory/transform/stock-level'

describe('odoo-inventory transformStockLevel', () => {
  it('maps quantity, reserved_quantity and available_quantity', () => {
    const s = StockLevelSchema.parse(
      transformStockLevel({
        id: 17,
        product_id: [42, '[E-COM07] Large Cabinet'],
        location_id: [8, 'WH/Stock'],
        warehouse_id: [1, 'WH'],
        lot_id: [3, 'LOT-0001'],
        quantity: 250,
        reserved_quantity: 10,
        available_quantity: 240,
      }),
    )
    expect(s).toMatchObject({
      id: '17',
      externalId: '17',
      productId: '42',
      locationId: '8',
      quantityOnHand: 250,
      quantityCommitted: 10,
      quantityAvailable: 240,
      lots: [{ lot: 'LOT-0001', quantity: 250 }],
      platform: 'odoo-inventory',
    })
    expect(s.metadata).toEqual({ warehouseId: '1' })
  })

  it('has no lots when the quant has no lot_id', () => {
    const s = StockLevelSchema.parse(
      transformStockLevel({
        id: 18,
        product_id: [42, 'Large Cabinet'],
        location_id: [8, 'WH/Stock'],
        warehouse_id: false,
        lot_id: false,
        quantity: 3,
        reserved_quantity: 0,
        available_quantity: 3,
      }),
    )
    expect(s.lots).toBeUndefined()
    expect(s.metadata).toEqual({})
  })

  it('refuses a quant without product or location (both are required=True)', () => {
    expect(() =>
      transformStockLevel({
        id: 19,
        product_id: false,
        location_id: [8, 'WH/Stock'],
        quantity: 1,
      }),
    ).toThrow(/stock.quant 19/)
  })
})
