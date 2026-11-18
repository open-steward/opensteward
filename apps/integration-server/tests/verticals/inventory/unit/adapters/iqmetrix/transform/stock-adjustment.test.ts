import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawIqmetrixStockAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/iqmetrix/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('transformStockAdjustment — iqmetrix', () => {
  const raw: RawIqmetrixStockAdjustment = {
    QuantityAdjustmentGuid: 'adj-guid-001',
    StoreEntityId: 12,
    EmployeeEntityId: 55,
    AdjustmentDateUtc: '2024-03-01T00:00:00Z',
    Products: [
      {
        CatalogItemId: 'cat-uuid-001',
        VendorSKU: 'VS-001',
        Quantity: -3,
        ReasonCode: 2,
        ReasonDescription: 'Item damaged in store',
        UnitCost: 10.5,
      },
    ],
  }
  const result = transformStockAdjustment(raw)

  it('sets id from QuantityAdjustmentGuid', () => {
    expect(result.id).toBe('adj-guid-001')
  })

  it('sets locationId from StoreEntityId', () => {
    expect(result.locationId).toBe('12')
  })

  it('maps damage description → damage reason', () => {
    expect(result.reason).toBe('damage')
  })

  it('sets line productId from CatalogItemId', () => {
    expect(result.lines[0]?.productId).toBe('cat-uuid-001')
  })

  it('sets line deltaQuantity from Quantity', () => {
    expect(result.lines[0]?.deltaQuantity).toBe(-3)
  })

  it('sets adjustedBy from EmployeeEntityId', () => {
    expect(result.adjustedBy).toBe('55')
  })

  it('sets adjustedAt from AdjustmentDateUtc', () => {
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to iqmetrix', () => {
    expect(result.platform).toBe('iqmetrix')
  })

  it('passes schema validation', () => {
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockAdjustment — reason code fallback', () => {
  const makeRaw = (ReasonCode: number): RawIqmetrixStockAdjustment => ({
    QuantityAdjustmentGuid: 'adj-guid-002',
    StoreEntityId: 1,
    AdjustmentDateUtc: '2024-03-01T00:00:00Z',
    Products: [{ CatalogItemId: 'cat-1', Quantity: 5, ReasonCode }],
  })

  it('maps ReasonCode 1 → cycle_count', () => {
    expect(transformStockAdjustment(makeRaw(1)).reason).toBe('cycle_count')
  })

  it('maps ReasonCode 3 → correction', () => {
    expect(transformStockAdjustment(makeRaw(3)).reason).toBe('correction')
  })
})
