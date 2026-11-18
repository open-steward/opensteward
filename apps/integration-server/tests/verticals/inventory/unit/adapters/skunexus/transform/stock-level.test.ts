import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawSkuNexusStockLevel,
} from '../../../../../../../src/verticals/inventory/adapters/skunexus/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('skunexus transformStockLevel', () => {
  const raw: RawSkuNexusStockLevel = {
    id: 'SL-1',
    product_id: 'PROD-1',
    location_id: 'LOC-5',
    on_hand: 100,
    available: 85,
    assigned: 10,
    reserved: 5,
    on_order: 50,
    reorder_point: 20,
    reorder_quantity: 100,
    last_counted_at: '2024-03-01T00:00:00Z',
  }

  it('maps productId and locationId', () => {
    const result = transformStockLevel(raw)
    expect(result.productId).toBe('PROD-1')
    expect(result.locationId).toBe('LOC-5')
    expect(result.platform).toBe('skunexus')
  })

  it('uses raw.id when present', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('SL-1')
  })

  it('synthesises id as "productId:locationId" when raw.id is absent', () => {
    const { id: _, ...noId } = raw
    const result = transformStockLevel(noId)
    expect(result.id).toBe('PROD-1:LOC-5')
  })

  it('maps quantityOnHand and quantityAvailable', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(100)
    expect(result.quantityAvailable).toBe(85)
  })

  it('computes quantityCommitted as assigned + reserved', () => {
    // assigned=10, reserved=5 → committed=15
    const result = transformStockLevel(raw)
    expect(result.quantityCommitted).toBe(15)
  })

  it('maps quantityIncoming from on_order', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityIncoming).toBe(50)
  })

  it('maps reorderPoint and reorderQuantity', () => {
    const result = transformStockLevel(raw)
    expect(result.reorderPoint).toBe(20)
    expect(result.reorderQuantity).toBe(100)
  })

  it('maps lastCountedAt as ISO string', () => {
    const result = transformStockLevel(raw)
    expect(result.lastCountedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('falls back to warehouse_id when location_id is absent', () => {
    const { location_id: _, ...noLoc } = raw
    const result = transformStockLevel({ ...noLoc, warehouse_id: 'WH-1' })
    expect(result.locationId).toBe('WH-1')
  })

  it('produces output satisfying StockLevelSchema', () => {
    const result = transformStockLevel(raw)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
