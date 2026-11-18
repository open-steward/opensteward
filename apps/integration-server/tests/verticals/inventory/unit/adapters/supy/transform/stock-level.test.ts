import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawSupyStockBalance,
} from '../../../../../../../src/verticals/inventory/adapters/supy/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

function makeRaw(overrides: Partial<RawSupyStockBalance> = {}): RawSupyStockBalance {
  return {
    itemId: 'item-20',
    branchId: 'branch-3',
    onHand: 120,
    available: 100,
    committed: 20,
    onOrder: 50,
    reorderPoint: 30,
    reorderQuantity: 100,
    lastCountedAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformStockLevel (supy)', () => {
  it('synthesizes id as <itemId>:<branchId>', () => {
    const result = transformStockLevel(makeRaw())
    expect(result.id).toBe('item-20:branch-3')
    expect(result.productId).toBe('item-20')
    expect(result.locationId).toBe('branch-3')
  })

  it('maps quantityOnHand from onHand', () => {
    const result = transformStockLevel(makeRaw({ onHand: 120 }))
    expect(result.quantityOnHand).toBe(120)
  })

  it('maps quantityAvailable from available', () => {
    const result = transformStockLevel(makeRaw())
    expect(result.quantityAvailable).toBe(100)
  })

  it('maps quantityCommitted from committed', () => {
    const result = transformStockLevel(makeRaw())
    expect(result.quantityCommitted).toBe(20)
  })

  it('maps quantityIncoming from onOrder', () => {
    const result = transformStockLevel(makeRaw())
    expect(result.quantityIncoming).toBe(50)
  })

  it('maps reorderPoint and reorderQuantity', () => {
    const result = transformStockLevel(makeRaw())
    expect(result.reorderPoint).toBe(30)
    expect(result.reorderQuantity).toBe(100)
  })

  it('maps lastCountedAt as ISO string', () => {
    const result = transformStockLevel(makeRaw())
    expect(result.lastCountedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('uses itemId alone as id when branchId is absent', () => {
    const result = transformStockLevel(makeRaw({ branchId: undefined }))
    expect(result.id).toBe('item-20')
    expect(result.locationId).toBe('')
  })

  it('defaults quantityOnHand to 0 when onHand is absent', () => {
    const result = transformStockLevel(makeRaw({ onHand: undefined }))
    expect(result.quantityOnHand).toBe(0)
  })

  it('platform is "supy"', () => {
    const result = transformStockLevel(makeRaw())
    expect(result.platform).toBe('supy')
  })

  it('passes StockLevelSchema validation', () => {
    const result = transformStockLevel(makeRaw())
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
