import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawDaVinciUnifiedStockLevel,
} from '../../../../../../../src/verticals/inventory/adapters/da-vinci-unified/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('da-vinci-unified transformStockLevel', () => {
  const raw: RawDaVinciUnifiedStockLevel = {
    itemId: 'item-001',
    warehouseId: 'wh-001',
    quantityOnHand: 250,
    quantityAvailable: 230,
    quantityAllocated: 20,
    quantityOnOrder: 100,
    reorderPoint: 50,
    reorderQuantity: 200,
    lastCountDate: '2024-03-01T00:00:00Z',
  }

  it('builds composite id from itemId and warehouseId', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('item-001:wh-001')
  })

  it('maps productId from itemId', () => {
    const result = transformStockLevel(raw)
    expect(result.productId).toBe('item-001')
  })

  it('maps locationId from warehouseId', () => {
    const result = transformStockLevel(raw)
    expect(result.locationId).toBe('wh-001')
  })

  it('maps quantityOnHand', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(250)
  })

  it('maps quantityCommitted from quantityAllocated', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityCommitted).toBe(20)
  })

  it('maps quantityIncoming from quantityOnOrder', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityIncoming).toBe(100)
  })

  it('maps reorderPoint and reorderQuantity', () => {
    const result = transformStockLevel(raw)
    expect(result.reorderPoint).toBe(50)
    expect(result.reorderQuantity).toBe(200)
  })

  it('maps lastCountedAt from lastCountDate', () => {
    const result = transformStockLevel(raw)
    expect(result.lastCountedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('defaults quantityOnHand to 0 when absent', () => {
    const result = transformStockLevel({ itemId: 'item-002', warehouseId: 'wh-001' })
    expect(result.quantityOnHand).toBe(0)
  })

  it('sets platform to da-vinci-unified', () => {
    const result = transformStockLevel(raw)
    expect(result.platform).toBe('da-vinci-unified')
  })

  it('produces output that satisfies StockLevelSchema', () => {
    const result = transformStockLevel(raw)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
