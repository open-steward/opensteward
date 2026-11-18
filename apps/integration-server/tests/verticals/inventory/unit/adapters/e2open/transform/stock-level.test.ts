import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawE2openStockLevel,
} from '../../../../../../../src/verticals/inventory/adapters/e2open/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('e2open transformStockLevel', () => {
  const raw: RawE2openStockLevel = {
    id: 'E2O-STOCK-001',
    partnerSkuCode: 'SKU-ABC',
    validatedSkuCode: 'VSKU-ABC',
    locationId: 'LOC-001',
    locationName: 'East Coast DC',
    quantity1: 300,
    availableQty: 250,
    allocatedQty: 50,
    inTransitQty: 75,
    reorderPoint: 100,
    reorderQty: 200,
    transactionDate: '2024-03-01T00:00:00.000Z',
    partnerCode: 'PARTNER-001',
  }

  it('maps productId from partnerSkuCode', () => {
    const result = transformStockLevel(raw)
    expect(result.productId).toBe('SKU-ABC')
  })

  it('falls back to validatedSkuCode then id for productId', () => {
    const result = transformStockLevel({ ...raw, partnerSkuCode: undefined })
    expect(result.productId).toBe('VSKU-ABC')
  })

  it('maps locationId from locationId field', () => {
    const result = transformStockLevel(raw)
    expect(result.locationId).toBe('LOC-001')
  })

  it('computes composite id as productId:locationId', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('SKU-ABC:LOC-001')
  })

  it('maps quantityOnHand from quantity1', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(300)
  })

  it('defaults quantityOnHand to 0 when quantity1 absent', () => {
    const result = transformStockLevel({ ...raw, quantity1: undefined })
    expect(result.quantityOnHand).toBe(0)
  })

  it('maps quantityAvailable from availableQty', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityAvailable).toBe(250)
  })

  it('maps quantityCommitted from allocatedQty', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityCommitted).toBe(50)
  })

  it('maps quantityIncoming from inTransitQty', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityIncoming).toBe(75)
  })

  it('maps reorderPoint from reorderPoint', () => {
    const result = transformStockLevel(raw)
    expect(result.reorderPoint).toBe(100)
  })

  it('maps reorderQuantity from reorderQty', () => {
    const result = transformStockLevel(raw)
    expect(result.reorderQuantity).toBe(200)
  })

  it('maps lastCountedAt from transactionDate', () => {
    const result = transformStockLevel(raw)
    expect(result.lastCountedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('stores locationName in metadata', () => {
    const result = transformStockLevel(raw)
    expect(result.metadata.locationName).toBe('East Coast DC')
  })

  it('sets platform to e2open', () => {
    const result = transformStockLevel(raw)
    expect(result.platform).toBe('e2open')
  })

  it('produces output that satisfies StockLevelSchema', () => {
    const result = transformStockLevel(raw)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
