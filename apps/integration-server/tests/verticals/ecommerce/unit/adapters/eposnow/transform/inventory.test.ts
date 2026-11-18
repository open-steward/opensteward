import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  transformProductStock,
  type RawEposNowProductStock,
  type RawEposNowStock,
} from '../../../../../../../src/verticals/ecommerce/adapters/eposnow/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeStock(overrides: Partial<RawEposNowStock> = {}): RawEposNowStock {
  return {
    Id: 3001,
    ProductId: 12345,
    LocationId: 1,
    CurrentStock: 42,
    LastUpdatedDate: '2024-06-15T12:00:00Z',
    ...overrides,
  }
}

describe('transformInventoryLevel (Epos Now)', () => {
  it('maps core fields', () => {
    const result = transformInventoryLevel(makeStock())
    expect(result.id).toBe('3001')
    expect(result.variantId).toBe('12345')
    expect(result.locationId).toBe('1')
    expect(result.available).toBe(42)
  })

  it('maps timestamp', () => {
    const result = transformInventoryLevel(makeStock())
    expect(result.updatedAt).toBe('2024-06-15T12:00:00Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeStock()
    const result = transformInventoryLevel(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeStock())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })

  it('defaults to 0 when CurrentStock is missing', () => {
    const result = transformInventoryLevel(makeStock({ CurrentStock: undefined }))
    expect(result.available).toBe(0)
  })

  it('synthesizes id when Id is missing', () => {
    const result = transformInventoryLevel(makeStock({ Id: undefined }))
    expect(result.id).toBe('12345:1')
  })
})

/**
 * The V4 ProductStock row (https://developer.eposnowhq.com/docs/v4/json,
 * definition ProductStock): Id, ProductId, LocationId, MinStock, MaxStock,
 * MinimumOrderAmount, MultipleOrderAmount, ProductStockBatches — each batch an
 * IProductStockBatch with CurrentStock, CurrentVolume, CostPrice, CreatedDate…
 */
describe('transformProductStock (Epos Now)', () => {
  function makeProductStock(overrides: Partial<RawEposNowProductStock> = {}): RawEposNowProductStock {
    return {
      Id: 88,
      ProductId: 12345,
      LocationId: 1,
      MinStock: 2,
      MaxStock: 50,
      ProductStockBatches: [
        { Id: 1, ProductStockId: 88, CurrentStock: 30, CostPrice: 1.5, CreatedDate: '2024-06-01T09:00:00' },
        { Id: 2, ProductStockId: 88, CurrentStock: 12, CostPrice: 1.6, CreatedDate: '2024-06-10T09:00:00' },
      ],
      ...overrides,
    }
  }

  it('is one level per product and location, available the batches summed', () => {
    const result = transformProductStock(makeProductStock())
    expect(result).toMatchObject({ id: '12345:1', variantId: '12345', locationId: '1', available: 42 })
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })

  it('is 0 with no batches', () => {
    expect(transformProductStock(makeProductStock({ ProductStockBatches: [] })).available).toBe(0)
    expect(transformProductStock(makeProductStock({ ProductStockBatches: undefined })).available).toBe(0)
  })

  it('floors an oversold (negative) total at 0 available, keeping the raw row', () => {
    const raw = makeProductStock({ ProductStockBatches: [{ CurrentStock: -3 }] })
    const result = transformProductStock(raw)
    expect(result.available).toBe(0)
    expect(result.metadata).toBe(raw)
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
