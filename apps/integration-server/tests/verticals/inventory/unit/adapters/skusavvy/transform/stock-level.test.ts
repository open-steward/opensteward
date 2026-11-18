import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawSkusavvyStockLevel,
} from '../../../../../../../src/verticals/inventory/adapters/skusavvy/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('skusavvy transformStockLevel', () => {
  const raw: RawSkusavvyStockLevel = {
    id: 'sl-01',
    productId: 'prod-01',
    locationId: 'loc-01',
    quantity: 100,
    available: 85,
    committed: 15,
    incoming: 50,
    reorderPoint: 20,
    reorderQuantity: 100,
    lastCountedAt: '2024-03-01T00:00:00Z',
  }

  it('maps id, productId, and locationId', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('sl-01')
    expect(result.productId).toBe('prod-01')
    expect(result.locationId).toBe('loc-01')
    expect(result.platform).toBe('skusavvy')
  })

  it('maps quantityOnHand from quantity field', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(100)
  })

  it('maps quantityAvailable, quantityCommitted, quantityIncoming', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityAvailable).toBe(85)
    expect(result.quantityCommitted).toBe(15)
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

  it('falls back to binId when locationId is absent', () => {
    const { locationId: _, ...noLoc } = raw
    const result = transformStockLevel({ ...noLoc, binId: 'bin-99' })
    expect(result.locationId).toBe('bin-99')
    expect(result.metadata['binId']).toBe('bin-99')
  })

  it('produces output satisfying StockLevelSchema', () => {
    const result = transformStockLevel(raw)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
