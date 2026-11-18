import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawOracleWmsInventory,
} from '../../../../../../../src/verticals/inventory/adapters/oracle-wms/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('oracle-wms transformStockLevel', () => {
  const raw: RawOracleWmsInventory = {
    inventory_id: 3001,
    item_id: 5001,
    location_id: 101,
    qty_on_hand: 250,
    qty_allocated: 10,
    qty_in_receipt: 100,
    lot_number: 'LOT-001',
    serial_number: '',
    last_inv_date: '2024-03-01T00:00:00Z',
    company_id: 1,
  }

  it('maps id from inventory_id', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('3001')
  })

  it('synthesises id from productId:locationId when inventory_id absent', () => {
    const result = transformStockLevel({ ...raw, inventory_id: undefined })
    expect(result.id).toBe('5001:101')
  })

  it('maps productId from item_id', () => {
    const result = transformStockLevel(raw)
    expect(result.productId).toBe('5001')
  })

  it('maps locationId from location_id', () => {
    const result = transformStockLevel(raw)
    expect(result.locationId).toBe('101')
  })

  it('maps quantityOnHand from qty_on_hand', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(250)
  })

  it('computes quantityAvailable as onHand minus allocated', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityAvailable).toBe(240)
  })

  it('maps quantityCommitted from qty_allocated', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityCommitted).toBe(10)
  })

  it('maps quantityIncoming from qty_in_receipt', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityIncoming).toBe(100)
  })

  it('maps lastCountedAt from last_inv_date', () => {
    const result = transformStockLevel(raw)
    expect(result.lastCountedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to oracle-wms', () => {
    const result = transformStockLevel(raw)
    expect(result.platform).toBe('oracle-wms')
  })

  it('produces output that satisfies StockLevelSchema', () => {
    const result = transformStockLevel(raw)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
