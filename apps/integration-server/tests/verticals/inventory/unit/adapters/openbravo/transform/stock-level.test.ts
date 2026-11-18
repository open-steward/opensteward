import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawOpenbravoStorageDetail,
} from '../../../../../../../src/verticals/inventory/adapters/openbravo/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('openbravo transformStockLevel', () => {
  const raw: RawOpenbravoStorageDetail = {
    id: 'sd-uuid-001',
    product: { id: 'prod-001' },
    storageBin: { id: 'bin-001', warehouse: { id: 'wh-001' } },
    quantityOnHand: 250,
    reservedQty: 10,
    orderQty: 100,
    updated: '2024-03-01T00:00:00Z',
  }

  it('maps id', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('sd-uuid-001')
  })

  it('maps productId from product.id', () => {
    const result = transformStockLevel(raw)
    expect(result.productId).toBe('prod-001')
  })

  it('maps locationId from storageBin.id', () => {
    const result = transformStockLevel(raw)
    expect(result.locationId).toBe('bin-001')
  })

  it('maps quantityOnHand', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(250)
  })

  it('computes quantityAvailable as onHand minus reserved', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityAvailable).toBe(240)
  })

  it('maps quantityCommitted from reservedQty', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityCommitted).toBe(10)
  })

  it('maps quantityIncoming from orderQty', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityIncoming).toBe(100)
  })

  it('maps lastCountedAt from updated', () => {
    const result = transformStockLevel(raw)
    expect(result.lastCountedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to openbravo', () => {
    const result = transformStockLevel(raw)
    expect(result.platform).toBe('openbravo')
  })

  it('produces output that satisfies StockLevelSchema', () => {
    const result = transformStockLevel(raw)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
