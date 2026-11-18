import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawOngoingWmsStockLevel,
} from '../../../../../../../src/verticals/inventory/adapters/ongoing-wms/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('ongoing-wms transformStockLevel', () => {
  const raw: RawOngoingWmsStockLevel = {
    articleSystemId: 18068,
    articleNumber: 'ART-001',
    goodsOwnerId: 42,
    inventoryInfo: {
      numberOfItems: 250,
      sellableNumberOfItems: 240,
      numberOfBookedItems: 5,
      allocatedNumberOfItems: 10,
      toReceiveNumberOfItems: 100,
      numberOfLockedItems: 3,
      lastInDate: '2024-03-01T00:00:00Z',
    },
  }

  it('maps id and productId from articleSystemId', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('18068')
    expect(result.productId).toBe('18068')
  })

  it('maps locationId from goodsOwnerId', () => {
    const result = transformStockLevel(raw)
    expect(result.locationId).toBe('42')
  })

  it('maps quantityOnHand from numberOfItems', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(250)
  })

  it('maps quantityAvailable from sellableNumberOfItems', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityAvailable).toBe(240)
  })

  it('maps quantityCommitted from allocatedNumberOfItems', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityCommitted).toBe(10)
  })

  it('maps quantityIncoming from toReceiveNumberOfItems', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityIncoming).toBe(100)
  })

  it('maps lastCountedAt from lastInDate', () => {
    const result = transformStockLevel(raw)
    expect(result.lastCountedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to ongoing-wms', () => {
    const result = transformStockLevel(raw)
    expect(result.platform).toBe('ongoing-wms')
  })

  it('produces output that satisfies StockLevelSchema', () => {
    const result = transformStockLevel(raw)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
