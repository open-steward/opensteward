import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawWaspBarcodeStockLevel,
} from '../../../../../../../src/verticals/inventory/adapters/wasp-barcode/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

const rawLevel: RawWaspBarcodeStockLevel = {
  ItemNumber: 'ITEM-001',
  LocationCode: 'A-01',
  SiteName: 'MAIN',
  Quantity: 250,
  QuantityAvailable: 240,
  QuantityCommitted: 10,
  QuantityOnOrder: 100,
  ReorderPoint: 50,
  ReorderQuantity: 200,
  LastCountDate: '2024-03-01T00:00:00Z',
}

describe('wasp-barcode transformStockLevel', () => {
  it('builds synthetic id as <itemNumber>:<locationCode>', () => {
    const result = transformStockLevel(rawLevel)
    expect(result.id).toBe('ITEM-001:A-01')
  })

  it('maps ItemNumber to productId', () => {
    const result = transformStockLevel(rawLevel)
    expect(result.productId).toBe('ITEM-001')
  })

  it('maps LocationCode to locationId', () => {
    const result = transformStockLevel(rawLevel)
    expect(result.locationId).toBe('A-01')
  })

  it('maps Quantity to quantityOnHand', () => {
    const result = transformStockLevel(rawLevel)
    expect(result.quantityOnHand).toBe(250)
  })

  it('maps QuantityAvailable to quantityAvailable', () => {
    const result = transformStockLevel(rawLevel)
    expect(result.quantityAvailable).toBe(240)
  })

  it('maps QuantityCommitted to quantityCommitted', () => {
    const result = transformStockLevel(rawLevel)
    expect(result.quantityCommitted).toBe(10)
  })

  it('maps QuantityOnOrder to quantityIncoming', () => {
    const result = transformStockLevel(rawLevel)
    expect(result.quantityIncoming).toBe(100)
  })

  it('maps ReorderPoint and ReorderQuantity', () => {
    const result = transformStockLevel(rawLevel)
    expect(result.reorderPoint).toBe(50)
    expect(result.reorderQuantity).toBe(200)
  })

  it('maps LastCountDate to lastCountedAt as ISO string', () => {
    const result = transformStockLevel(rawLevel)
    expect(result.lastCountedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform=wasp-barcode', () => {
    const result = transformStockLevel(rawLevel)
    expect(result.platform).toBe('wasp-barcode')
  })

  it('produces a schema-valid StockLevel', () => {
    const result = transformStockLevel(rawLevel)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })

  it('falls back to SiteName when LocationCode absent', () => {
    const result = transformStockLevel({ ...rawLevel, LocationCode: undefined })
    expect(result.locationId).toBe('MAIN')
    expect(result.id).toBe('ITEM-001:MAIN')
  })
})
