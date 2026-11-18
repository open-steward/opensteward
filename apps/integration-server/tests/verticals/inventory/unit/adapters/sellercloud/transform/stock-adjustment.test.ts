import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawSellercloudStockAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/sellercloud/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('sellercloud transformStockAdjustment', () => {
  const raw: RawSellercloudStockAdjustment = {
    ID: 'adj-001',
    ProductID: '123',
    WarehouseID: 42,
    Qty: 10,
    AdjustmentType: 1, // Add
    Reason: 'Correction after cycle count',
    AdjustedAt: '2024-03-01T00:00:00Z',
    AdjustedBy: 'admin',
  }

  it('uses provided ID as id and externalId', () => {
    const result = transformStockAdjustment(raw)
    expect(result.id).toBe('adj-001')
    expect(result.externalId).toBe('adj-001')
  })

  it('maps WarehouseID to locationId', () => {
    const result = transformStockAdjustment(raw)
    expect(result.locationId).toBe('42')
  })

  it('AdjustmentType 1 (Add) keeps quantity positive', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines[0].deltaQuantity).toBe(10)
  })

  it('AdjustmentType 0 (Subtract) negates quantity', () => {
    const subtract: RawSellercloudStockAdjustment = { ...raw, AdjustmentType: 0 }
    const result = transformStockAdjustment(subtract)
    expect(result.lines[0].deltaQuantity).toBe(-10)
  })

  it('maps ProductID to lines[0].productId', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines[0].productId).toBe('123')
  })

  it('maps Reason containing "count" to "cycle_count"', () => {
    const result = transformStockAdjustment(raw)
    expect(result.reason).toBe('cycle_count')
  })

  it('maps Reason containing "damage" to "damage"', () => {
    const damaged: RawSellercloudStockAdjustment = { ...raw, Reason: 'Damaged goods' }
    expect(transformStockAdjustment(damaged).reason).toBe('damage')
  })

  it('maps unknown Reason to "other"', () => {
    const other: RawSellercloudStockAdjustment = { ...raw, Reason: 'Miscellaneous' }
    expect(transformStockAdjustment(other).reason).toBe('other')
  })

  it('maps AdjustedAt to adjustedAt', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps AdjustedBy to adjustedBy', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedBy).toBe('admin')
  })

  it('generates a synthetic id when ID is absent', () => {
    const noId: RawSellercloudStockAdjustment = { ...raw, ID: undefined }
    const result = transformStockAdjustment(noId)
    expect(result.id).toMatch(/^sellercloud:adj:123:\d+$/)
  })

  it('satisfies StockAdjustmentSchema', () => {
    expect(() => StockAdjustmentSchema.parse(transformStockAdjustment(raw))).not.toThrow()
  })
})
