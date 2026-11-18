import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawBlueYonderInventoryPosition,
} from '../../../../../../../src/verticals/inventory/adapters/blue-yonder/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('blue-yonder transformStockLevel', () => {
  const raw: RawBlueYonderInventoryPosition = {
    positionId: 'pos-001',
    itemId: 'item-001',
    itemDescription: 'Widget A',
    locationId: 'loc-001',
    locationName: 'Warehouse A',
    zone: 'Zone 1',
    quantityOnHand: 100,
    quantityAvailable: 90,
    quantityReserved: 10,
    unitOfMeasure: 'EA',
    lotNumber: 'LOT-001',
    serialNumber: 'SN-001',
    expirationDate: '2024-03-01T00:00:00Z',
    status: 'active',
    lastUpdated: '2024-03-01T00:00:00Z',
  }

  it('maps id from positionId', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('pos-001')
  })

  it('synthesises id from itemId:locationId when positionId is absent', () => {
    const result = transformStockLevel({ ...raw, positionId: undefined })
    expect(result.id).toBe('item-001:loc-001')
  })

  it('maps productId from itemId', () => {
    const result = transformStockLevel(raw)
    expect(result.productId).toBe('item-001')
  })

  it('maps locationId', () => {
    const result = transformStockLevel(raw)
    expect(result.locationId).toBe('loc-001')
  })

  it('maps quantityOnHand', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(100)
  })

  it('maps quantityAvailable', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityAvailable).toBe(90)
  })

  it('maps quantityCommitted from quantityReserved', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityCommitted).toBe(10)
  })

  it('maps lastCountedAt from lastUpdated', () => {
    const result = transformStockLevel(raw)
    expect(result.lastCountedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to blue-yonder', () => {
    const result = transformStockLevel(raw)
    expect(result.platform).toBe('blue-yonder')
  })

  it('produces output that satisfies StockLevelSchema', () => {
    const result = transformStockLevel(raw)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
