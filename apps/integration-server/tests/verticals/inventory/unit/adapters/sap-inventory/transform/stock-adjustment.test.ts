import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawSapStockAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/sap-inventory/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('sap-inventory transformStockAdjustment', () => {
  const raw: RawSapStockAdjustment = {
    MaterialDocument: 'MAT-DOC-001',
    MaterialDocumentYear: '2024',
    PostingDate: '2024-03-01T00:00:00Z',
    CreatedByUser: 'jdoe',
    to_MaterialDocumentItem: {
      results: [
        {
          Material: 'MAT-001',
          Plant: '1000',
          StorageLocation: '0001',
          GoodsMovementType: '701',
          QuantityInBaseUnit: 10,
        },
      ],
    },
  }

  it('maps id as MaterialDocument:MaterialDocumentYear', () => {
    const result = transformStockAdjustment(raw)
    expect(result.id).toBe('MAT-DOC-001:2024')
  })

  it('maps locationId as Plant:StorageLocation from first item', () => {
    const result = transformStockAdjustment(raw)
    expect(result.locationId).toBe('1000:0001')
  })

  it('locationId is just Plant when StorageLocation absent', () => {
    const result = transformStockAdjustment({
      ...raw,
      to_MaterialDocumentItem: {
        results: [
          { Material: 'MAT-001', Plant: '1000', GoodsMovementType: '701', QuantityInBaseUnit: 5 },
        ],
      },
    })
    expect(result.locationId).toBe('1000')
  })

  it('movement type 701 → reason cycle_count and positive delta', () => {
    const result = transformStockAdjustment(raw)
    expect(result.reason).toBe('cycle_count')
    expect(result.lines[0].deltaQuantity).toBe(10)
  })

  it('movement type 702 → reason cycle_count and negative delta', () => {
    const result = transformStockAdjustment({
      ...raw,
      to_MaterialDocumentItem: {
        results: [
          {
            Material: 'MAT-001',
            Plant: '1000',
            StorageLocation: '0001',
            GoodsMovementType: '702',
            QuantityInBaseUnit: 5,
          },
        ],
      },
    })
    expect(result.reason).toBe('cycle_count')
    expect(result.lines[0].deltaQuantity).toBe(-5)
  })

  it('movement type 551 (scrapping) → reason damage and negative delta', () => {
    const result = transformStockAdjustment({
      ...raw,
      to_MaterialDocumentItem: {
        results: [
          {
            Material: 'MAT-001',
            Plant: '1000',
            StorageLocation: '0001',
            GoodsMovementType: '551',
            QuantityInBaseUnit: 3,
          },
        ],
      },
    })
    expect(result.reason).toBe('damage')
    expect(result.lines[0].deltaQuantity).toBe(-3)
  })

  it('maps productId from Material on each line', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines[0].productId).toBe('MAT-001')
  })

  it('maps adjustedAt from PostingDate', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps adjustedBy from CreatedByUser', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedBy).toBe('jdoe')
  })

  it('handles to_MaterialDocumentItem as plain array', () => {
    const result = transformStockAdjustment({
      ...raw,
      to_MaterialDocumentItem: [
        { Material: 'MAT-002', Plant: '1000', GoodsMovementType: '711', QuantityInBaseUnit: 7 },
      ],
    })
    expect(result.lines[0].productId).toBe('MAT-002')
    expect(result.lines[0].deltaQuantity).toBe(7)
  })

  it('platform is sap-inventory', () => {
    const result = transformStockAdjustment(raw)
    expect(result.platform).toBe('sap-inventory')
  })

  it('produces output satisfying StockAdjustmentSchema', () => {
    const result = transformStockAdjustment(raw)
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
