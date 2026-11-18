import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  transformStockLevelsFromBinLocation,
} from '../../../../../../../src/verticals/inventory/adapters/pickware/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('transformStockLevel — single mapping', () => {
  const raw = {
    id: 200,
    binLocationId: 50,
    articleDetailId: 84,
    stock: 25,
    defaultMapping: true,
    reservedStock: 5,
    lastStockTake: '2024-03-01T00:00:00Z',
  }
  const result = transformStockLevel(raw, 'BIN-A1', 7)

  it('sets id as productId:binId', () => {
    expect(result.id).toBe('84:50')
  })

  it('sets productId from articleDetailId', () => {
    expect(result.productId).toBe('84')
  })

  it('sets locationId from binLocationId', () => {
    expect(result.locationId).toBe('50')
  })

  it('sets quantityOnHand from stock', () => {
    expect(result.quantityOnHand).toBe(25)
  })

  it('sets quantityCommitted from reservedStock', () => {
    expect(result.quantityCommitted).toBe(5)
  })

  it('sets lastCountedAt as ISO string', () => {
    expect(result.lastCountedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to pickware', () => {
    expect(result.platform).toBe('pickware')
  })

  it('stores binCode in metadata', () => {
    expect(result.metadata['binCode']).toBe('BIN-A1')
  })

  it('passes schema validation', () => {
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockLevel — missing optional fields', () => {
  const result = transformStockLevel({
    id: 201,
    binLocationId: 51,
    articleDetailId: 85,
  })

  it('defaults quantityOnHand to 0 when stock absent', () => {
    expect(result.quantityOnHand).toBe(0)
  })

  it('leaves quantityCommitted undefined when reservedStock absent', () => {
    expect(result.quantityCommitted).toBeUndefined()
  })

  it('leaves lastCountedAt undefined when lastStockTake absent', () => {
    expect(result.lastCountedAt).toBeUndefined()
  })

  it('passes schema validation', () => {
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockLevelsFromBinLocation — expands one bin into N stock levels', () => {
  const raw = {
    id: 50,
    warehouseId: 7,
    code: 'BIN-A1',
    articleDetailBinLocationMappings: [
      { id: 200, binLocationId: 50, articleDetailId: 84, stock: 10, reservedStock: 2 },
      { id: 201, binLocationId: 50, articleDetailId: 85, stock: 5, reservedStock: 0 },
    ],
  }
  const results = transformStockLevelsFromBinLocation(raw)

  it('returns one StockLevel per mapping', () => {
    expect(results).toHaveLength(2)
  })

  it('first result has correct productId', () => {
    expect(results[0]!.productId).toBe('84')
  })

  it('first result has correct locationId (binId)', () => {
    expect(results[0]!.locationId).toBe('50')
  })

  it('first result has correct quantityOnHand', () => {
    expect(results[0]!.quantityOnHand).toBe(10)
  })

  it('each result passes schema validation', () => {
    for (const r of results) {
      expect(() => StockLevelSchema.parse(r)).not.toThrow()
    }
  })
})

describe('transformStockLevelsFromBinLocation — empty mappings array', () => {
  const result = transformStockLevelsFromBinLocation({
    id: 99,
    articleDetailBinLocationMappings: [],
  })

  it('returns empty array when no mappings', () => {
    expect(result).toEqual([])
  })
})
