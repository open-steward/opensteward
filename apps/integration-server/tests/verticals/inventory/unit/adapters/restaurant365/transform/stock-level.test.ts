import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawR365TransactionDetail,
} from '../../../../../../../src/verticals/inventory/adapters/restaurant365/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('restaurant365 transformStockLevel', () => {
  const raw: RawR365TransactionDetail = {
    transactionDetailId: 'detail-guid-001',
    transactionId: 'txn-guid-001',
    locationId: 'loc-guid-001',
    itemId: 'item-guid-001',
    quantity: 45,
    adjustment: -5,
    previousCountTotal: 50,
    unitOfMeasureName: 'each',
    rowType: 'Inventory Count',
    createdOn: '2024-03-01T00:00:00Z',
    modifiedOn: '2024-03-01T00:00:00Z',
  }

  it('constructs 3-part synthetic id', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('item-guid-001:loc-guid-001:detail-guid-001')
  })

  it('maps productId and locationId', () => {
    const result = transformStockLevel(raw)
    expect(result.productId).toBe('item-guid-001')
    expect(result.locationId).toBe('loc-guid-001')
  })

  it('maps quantityOnHand from quantity', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(45)
  })

  it('sets quantityAvailable, quantityCommitted, quantityIncoming to undefined', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityAvailable).toBeUndefined()
    expect(result.quantityCommitted).toBeUndefined()
    expect(result.quantityIncoming).toBeUndefined()
  })

  it('maps lastCountedAt from modifiedOn', () => {
    const result = transformStockLevel(raw)
    expect(result.lastCountedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('falls back lastCountedAt to createdOn when modifiedOn is absent', () => {
    const result = transformStockLevel({ ...raw, modifiedOn: undefined })
    expect(result.lastCountedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('stores adjustment and transactionId in metadata', () => {
    const result = transformStockLevel(raw)
    expect(result.metadata['adjustment']).toBe('-5')
    expect(result.metadata['transactionId']).toBe('txn-guid-001')
  })

  it('defaults quantityOnHand to 0 when quantity is absent', () => {
    const result = transformStockLevel({ ...raw, quantity: undefined })
    expect(result.quantityOnHand).toBe(0)
  })

  it('produces output that satisfies StockLevelSchema', () => {
    const result = transformStockLevel(raw)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
