import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawErpagStockLevel,
} from '../../../../../../../src/verticals/inventory/adapters/erpag/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('erpag transformStockLevel', () => {
  const raw: RawErpagStockLevel = {
    productId: 'erpag-prod-001',
    warehouse: 'WH-MAIN',
    quantity: 100,
    available: 90,
    reserved: 10,
    onOrder: 50,
    reorderPoint: 20,
    reorderQuantity: 200,
  }

  it('maps id as productId:warehouse composite', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('erpag-prod-001:WH-MAIN')
  })

  it('maps productId', () => {
    const result = transformStockLevel(raw)
    expect(result.productId).toBe('erpag-prod-001')
  })

  it('maps locationId from warehouse', () => {
    const result = transformStockLevel(raw)
    expect(result.locationId).toBe('WH-MAIN')
  })

  it('maps quantityOnHand from quantity', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(100)
  })

  it('maps quantityAvailable from available', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityAvailable).toBe(90)
  })

  it('maps quantityCommitted from reserved', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityCommitted).toBe(10)
  })

  it('maps quantityIncoming from onOrder', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityIncoming).toBe(50)
  })

  it('maps reorderPoint', () => {
    const result = transformStockLevel(raw)
    expect(result.reorderPoint).toBe(20)
  })

  it('maps reorderQuantity', () => {
    const result = transformStockLevel(raw)
    expect(result.reorderQuantity).toBe(200)
  })

  it('sets platform to erpag', () => {
    const result = transformStockLevel(raw)
    expect(result.platform).toBe('erpag')
  })

  it('produces output that satisfies StockLevelSchema', () => {
    const result = transformStockLevel(raw)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
