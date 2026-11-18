import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawVarioManualMovement,
} from '../../../../../../../src/verticals/inventory/adapters/vario-software/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

const baseRaw: RawVarioManualMovement = {
  id: 'mv-001',
  articleId: 'art-001',
  storageBinId: 'bin-007',
  factor: 'INCREMENT',
  quantity: 10,
  valueDate: '2024-03-01T00:00:00Z',
  note: 'routine entry',
  type: 'MANUAL',
  productNumber: 'WK-2026',
  bookingTypeId: 'bt-1',
}

describe('vario-software transformStockAdjustment', () => {
  it('maps id from id field', () => {
    expect(transformStockAdjustment(baseRaw).id).toBe('mv-001')
  })

  it('maps locationId from storageBinId', () => {
    expect(transformStockAdjustment(baseRaw).locationId).toBe('bin-007')
  })

  it('maps line productId from articleId', () => {
    const result = transformStockAdjustment(baseRaw)
    expect(result.lines[0]!.productId).toBe('art-001')
  })

  it('deltaQuantity is positive for INCREMENT factor', () => {
    const result = transformStockAdjustment(baseRaw)
    expect(result.lines[0]!.deltaQuantity).toBe(10)
  })

  it('deltaQuantity is negative for DECREMENT factor', () => {
    const result = transformStockAdjustment({ ...baseRaw, factor: 'DECREMENT', quantity: 5 })
    expect(result.lines[0]!.deltaQuantity).toBe(-5)
  })

  it('maps reason to cycle_count for INVENTORY type', () => {
    const result = transformStockAdjustment({ ...baseRaw, type: 'INVENTORY', note: undefined })
    expect(result.reason).toBe('cycle_count')
  })

  it('maps reason to other for MANUAL type with generic note', () => {
    const result = transformStockAdjustment({ ...baseRaw, note: 'routine entry' })
    expect(result.reason).toBe('other')
  })

  it('maps reason to damage from note keyword', () => {
    const result = transformStockAdjustment({ ...baseRaw, note: 'damage to goods' })
    expect(result.reason).toBe('damage')
  })

  it('maps adjustedAt from valueDate', () => {
    const result = transformStockAdjustment(baseRaw)
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to vario-software', () => {
    expect(transformStockAdjustment(baseRaw).platform).toBe('vario-software')
  })

  it('produces output that satisfies StockAdjustmentSchema', () => {
    expect(() => StockAdjustmentSchema.parse(transformStockAdjustment(baseRaw))).not.toThrow()
  })
})
