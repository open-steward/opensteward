import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawTecsysStockLevel,
} from '../../../../../../../src/verticals/inventory/adapters/tecsys/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

function makeRaw(overrides: Partial<RawTecsysStockLevel> = {}): RawTecsysStockLevel {
  return {
    Sku: 'SKU-TECSYS-001',
    LocationInternalName: 'LOC-MAIN',
    OnHandQuantity: 300,
    AvailableQuantity: 270,
    CommittedQuantity: 30,
    IncomingQuantity: 60,
    ReorderPoint: 50,
    ReorderQuantity: 200,
    LastCountDate: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformStockLevel (tecsys)', () => {
  it('synthesizes id as <Sku>:<LocationInternalName>', () => {
    const result = transformStockLevel(makeRaw())
    expect(result.id).toBe('SKU-TECSYS-001:LOC-MAIN')
    expect(result.productId).toBe('SKU-TECSYS-001')
    expect(result.locationId).toBe('LOC-MAIN')
  })

  it('maps quantityOnHand from OnHandQuantity', () => {
    const result = transformStockLevel(makeRaw({ OnHandQuantity: 300 }))
    expect(result.quantityOnHand).toBe(300)
  })

  it('maps quantityAvailable from AvailableQuantity', () => {
    const result = transformStockLevel(makeRaw())
    expect(result.quantityAvailable).toBe(270)
  })

  it('maps quantityCommitted from CommittedQuantity', () => {
    const result = transformStockLevel(makeRaw())
    expect(result.quantityCommitted).toBe(30)
  })

  it('maps quantityIncoming from IncomingQuantity', () => {
    const result = transformStockLevel(makeRaw())
    expect(result.quantityIncoming).toBe(60)
  })

  it('maps reorderPoint and reorderQuantity', () => {
    const result = transformStockLevel(makeRaw())
    expect(result.reorderPoint).toBe(50)
    expect(result.reorderQuantity).toBe(200)
  })

  it('maps lastCountedAt from LastCountDate as ISO string', () => {
    const result = transformStockLevel(makeRaw())
    expect(result.lastCountedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('uses Sku alone as locationId when LocationInternalName is absent', () => {
    const result = transformStockLevel(makeRaw({ LocationInternalName: undefined }))
    expect(result.locationId).toBe('')
    expect(result.id).toBe('SKU-TECSYS-001:')
  })

  it('defaults quantityOnHand to 0 when OnHandQuantity is absent', () => {
    const result = transformStockLevel(makeRaw({ OnHandQuantity: undefined }))
    expect(result.quantityOnHand).toBe(0)
  })

  it('platform is "tecsys"', () => {
    const result = transformStockLevel(makeRaw())
    expect(result.platform).toBe('tecsys')
  })

  it('passes StockLevelSchema validation', () => {
    const result = transformStockLevel(makeRaw())
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
