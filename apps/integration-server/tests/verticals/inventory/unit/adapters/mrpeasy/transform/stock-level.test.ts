import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawMrpeasyStockLevel,
} from '../../../../../../../src/verticals/inventory/adapters/mrpeasy/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('mrpeasy transformStockLevel', () => {
  const raw: RawMrpeasyStockLevel = {
    article_id: 100,
    code: 'OLV-001',
    title: 'Olive Oil',
    in_stock: 50,
    available: 45,
    booked: 5,
    expected_total: 20,
    min_quantity: 10,
    site_id: 3,
  }

  it('maps productId from article_id as string', () => {
    const result = transformStockLevel(raw)
    expect(result.productId).toBe('100')
  })

  it('maps locationId from site_id as string', () => {
    const result = transformStockLevel(raw)
    expect(result.locationId).toBe('3')
  })

  it('constructs id from productId:siteId', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('100:3')
  })

  it('maps quantityOnHand from in_stock', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(50)
  })

  it('maps quantityAvailable from available', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityAvailable).toBe(45)
  })

  it('maps quantityCommitted from booked', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityCommitted).toBe(5)
  })

  it('maps quantityIncoming from expected_total', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityIncoming).toBe(20)
  })

  it('maps reorderPoint from min_quantity', () => {
    const result = transformStockLevel(raw)
    expect(result.reorderPoint).toBe(10)
  })

  it('uses productId alone as id when no site_id', () => {
    const raw2: RawMrpeasyStockLevel = { article_id: 200, in_stock: 0 }
    const result = transformStockLevel(raw2)
    expect(result.id).toBe('200')
  })

  it('sets platform to mrpeasy', () => {
    const result = transformStockLevel(raw)
    expect(result.platform).toBe('mrpeasy')
  })

  it('produces output that satisfies StockLevelSchema', () => {
    const result = transformStockLevel(raw)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
