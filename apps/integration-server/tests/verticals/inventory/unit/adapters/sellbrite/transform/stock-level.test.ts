import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawSellbriteInventory,
} from '../../../../../../../src/verticals/inventory/adapters/sellbrite/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('sellbrite transformStockLevel', () => {
  const raw: RawSellbriteInventory = {
    sku: 'WK-2026',
    warehouse_uuid: 'wh-uuid-001',
    on_hand: 100,
    available: 90,
    reserved: 10,
    bin_location: 'A-01',
  }

  it('synthesises id as sku:warehouse_uuid', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('WK-2026:wh-uuid-001')
  })

  it('maps productId from sku', () => {
    const result = transformStockLevel(raw)
    expect(result.productId).toBe('WK-2026')
  })

  it('maps locationId from warehouse_uuid', () => {
    const result = transformStockLevel(raw)
    expect(result.locationId).toBe('wh-uuid-001')
  })

  it('maps quantityOnHand from on_hand', () => {
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

  it('quantityIncoming is undefined (not exposed by Sellbrite)', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityIncoming).toBeUndefined()
  })

  it('quantityOnHand defaults to 0 when on_hand absent', () => {
    const result = transformStockLevel({ sku: 'WK-2026', warehouse_uuid: 'wh-uuid-001' })
    expect(result.quantityOnHand).toBe(0)
  })

  it('platform is sellbrite', () => {
    const result = transformStockLevel(raw)
    expect(result.platform).toBe('sellbrite')
  })

  it('produces output satisfying StockLevelSchema', () => {
    const result = transformStockLevel(raw)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
