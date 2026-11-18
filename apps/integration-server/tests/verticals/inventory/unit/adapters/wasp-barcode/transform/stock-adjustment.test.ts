import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawWaspBarcodeStockAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/wasp-barcode/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

const rawAdj: RawWaspBarcodeStockAdjustment = {
  TransactionId: 'TXN-999',
  ItemNumber: 'ITEM-001',
  LocationCode: 'A-01',
  SiteName: 'MAIN',
  Quantity: -5,
  Reason: 'damage - broken during handling',
  TransactionDate: '2024-03-01T00:00:00Z',
  UserName: 'jdoe',
  Notes: 'Dropped in transit',
}

describe('wasp-barcode transformStockAdjustment', () => {
  it('maps TransactionId to id', () => {
    const result = transformStockAdjustment(rawAdj)
    expect(result.id).toBe('TXN-999')
    expect(result.externalId).toBe('TXN-999')
  })

  it('maps LocationCode to locationId', () => {
    const result = transformStockAdjustment(rawAdj)
    expect(result.locationId).toBe('A-01')
  })

  it('maps damage reason keyword to "damage"', () => {
    const result = transformStockAdjustment(rawAdj)
    expect(result.reason).toBe('damage')
  })

  it('creates one line with correct productId and deltaQuantity', () => {
    const result = transformStockAdjustment(rawAdj)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('ITEM-001')
    expect(result.lines[0]!.deltaQuantity).toBe(-5)
  })

  it('maps Notes to line notes', () => {
    const result = transformStockAdjustment(rawAdj)
    expect(result.lines[0]!.notes).toBe('Dropped in transit')
  })

  it('maps TransactionDate to adjustedAt', () => {
    const result = transformStockAdjustment(rawAdj)
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps UserName to adjustedBy', () => {
    const result = transformStockAdjustment(rawAdj)
    expect(result.adjustedBy).toBe('jdoe')
  })

  it('sets platform=wasp-barcode', () => {
    const result = transformStockAdjustment(rawAdj)
    expect(result.platform).toBe('wasp-barcode')
  })

  it('produces a schema-valid StockAdjustment', () => {
    const result = transformStockAdjustment(rawAdj)
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })

  it('maps cycle_count reason keyword correctly', () => {
    const result = transformStockAdjustment({ ...rawAdj, Reason: 'annual count' })
    expect(result.reason).toBe('cycle_count')
  })

  it('falls back to SiteName when LocationCode absent', () => {
    const result = transformStockAdjustment({ ...rawAdj, LocationCode: undefined })
    expect(result.locationId).toBe('MAIN')
  })
})
