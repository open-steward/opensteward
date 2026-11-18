import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawKinaxisOnHandInventory,
} from '../../../../../../../src/verticals/inventory/adapters/kinaxis/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('kinaxis transformStockLevel', () => {
  const raw: RawKinaxisOnHandInventory = {
    id: 'inv-uuid-001',
    partId: 'part-uuid-001',
    siteId: 'site-uuid-001',
    onHand: 100,
    available: 80,
    committed: 15,
    inTransit: 25,
    reorderPoint: 20,
    reorderQty: 50,
    lastCountDate: '2024-03-01T00:00:00Z',
  }

  it('uses raw.id when provided', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('inv-uuid-001')
  })

  it('builds composite id when raw.id is missing', () => {
    const result = transformStockLevel({ ...raw, id: undefined })
    expect(result.id).toBe('part-uuid-001:site-uuid-001')
  })

  it('maps productId from partId', () => {
    const result = transformStockLevel(raw)
    expect(result.productId).toBe('part-uuid-001')
  })

  it('maps locationId from siteId', () => {
    const result = transformStockLevel(raw)
    expect(result.locationId).toBe('site-uuid-001')
  })

  it('maps quantityOnHand from onHand', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(100)
  })

  it('maps quantityAvailable', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityAvailable).toBe(80)
  })

  it('maps quantityCommitted', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityCommitted).toBe(15)
  })

  it('maps quantityIncoming from inTransit', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityIncoming).toBe(25)
  })

  it('maps reorderPoint', () => {
    const result = transformStockLevel(raw)
    expect(result.reorderPoint).toBe(20)
  })

  it('maps reorderQuantity from reorderQty', () => {
    const result = transformStockLevel(raw)
    expect(result.reorderQuantity).toBe(50)
  })

  it('maps lastCountedAt from lastCountDate', () => {
    const result = transformStockLevel(raw)
    expect(result.lastCountedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('defaults quantityOnHand to 0 when onHand missing', () => {
    const result = transformStockLevel({ partId: 'x', onHand: undefined })
    expect(result.quantityOnHand).toBe(0)
  })

  it('sets platform to kinaxis', () => {
    const result = transformStockLevel(raw)
    expect(result.platform).toBe('kinaxis')
  })

  it('produces output that satisfies StockLevelSchema', () => {
    expect(() => StockLevelSchema.parse(transformStockLevel(raw))).not.toThrow()
  })
})
