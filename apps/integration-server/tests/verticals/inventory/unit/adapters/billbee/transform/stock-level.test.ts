import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawBillbeeStockEntry,
} from '../../../../../../../src/verticals/inventory/adapters/billbee/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('billbee transformStockLevel', () => {
  const raw: RawBillbeeStockEntry = {
    productId: '12345',
    StockId: 7,
    Name: 'Hauptlager',
    StockCurrent: 100,
    StockDesired: 150,
    StockWarning: 10,
    UnfulfilledAmount: 5,
    StockCode: 'STK-001',
    StockCurrentIsCalculated: false,
  }

  it('computes id as productId:locationId', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('12345:7')
  })

  it('maps productId', () => {
    const result = transformStockLevel(raw)
    expect(result.productId).toBe('12345')
  })

  it('maps locationId from StockId', () => {
    const result = transformStockLevel(raw)
    expect(result.locationId).toBe('7')
  })

  it('maps quantityOnHand from StockCurrent', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(100)
  })

  it('maps quantityCommitted from UnfulfilledAmount', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityCommitted).toBe(5)
  })

  it('calculates quantityAvailable as onHand minus committed', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityAvailable).toBe(95)
  })

  it('maps reorderPoint from StockWarning', () => {
    const result = transformStockLevel(raw)
    expect(result.reorderPoint).toBe(10)
  })

  it('defaults quantityOnHand to 0 when StockCurrent is absent', () => {
    const result = transformStockLevel({ ...raw, StockCurrent: undefined })
    expect(result.quantityOnHand).toBe(0)
  })

  it('sets platform to billbee', () => {
    const result = transformStockLevel(raw)
    expect(result.platform).toBe('billbee')
  })

  it('produces output that satisfies StockLevelSchema', () => {
    const result = transformStockLevel(raw)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
