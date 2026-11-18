import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawTexadaStockAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/texada/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('transformStockAdjustment', () => {
  const base: RawTexadaStockAdjustment = {
    adjustmentId: 'ADJ-001',
    branchId: 'branch-001',
    reason: 'cycle count',
    status: 'posted',
    adjustmentDate: '2024-03-01T00:00:00Z',
    operatorName: 'Jane Smith',
    lines: [
      {
        itemNo: 'ITEM-001',
        quantityChange: -5,
        countedQuantity: 45,
        notes: 'Recount after discrepancy',
      },
    ],
  }

  it('maps adjustmentId → id and externalId', () => {
    const result = transformStockAdjustment(base)
    expect(result.id).toBe('ADJ-001')
    expect(result.externalId).toBe('ADJ-001')
  })

  it('maps branchId → locationId', () => {
    const result = transformStockAdjustment(base)
    expect(result.locationId).toBe('branch-001')
  })

  it('maps "cycle count" reason → "cycle_count"', () => {
    const result = transformStockAdjustment(base)
    expect(result.reason).toBe('cycle_count')
  })

  it('maps "damage" reason → "damage"', () => {
    const result = transformStockAdjustment({ ...base, reason: 'damage write-off' })
    expect(result.reason).toBe('damage')
  })

  it('maps "theft" reason → "theft"', () => {
    const result = transformStockAdjustment({ ...base, reason: 'theft reported' })
    expect(result.reason).toBe('theft')
  })

  it('maps "lost" reason → "lost"', () => {
    const result = transformStockAdjustment({ ...base, reason: 'item lost' })
    expect(result.reason).toBe('lost')
  })

  it('maps "found" reason → "found"', () => {
    const result = transformStockAdjustment({ ...base, reason: 'found in storage' })
    expect(result.reason).toBe('found')
  })

  it('maps "expir" reason → "expiration"', () => {
    const result = transformStockAdjustment({ ...base, reason: 'expiration' })
    expect(result.reason).toBe('expiration')
  })

  it('maps "correct" reason → "correction"', () => {
    const result = transformStockAdjustment({ ...base, reason: 'correction' })
    expect(result.reason).toBe('correction')
  })

  it('maps "error" reason → "correction"', () => {
    const result = transformStockAdjustment({ ...base, reason: 'data error' })
    expect(result.reason).toBe('correction')
  })

  it('maps "adj" reason → "correction"', () => {
    const result = transformStockAdjustment({ ...base, reason: 'adj' })
    expect(result.reason).toBe('correction')
  })

  it('maps unknown reason → "other"', () => {
    const result = transformStockAdjustment({ ...base, reason: 'miscellaneous' })
    expect(result.reason).toBe('other')
  })

  it('maps adjustmentDate → adjustedAt as ISO string', () => {
    const result = transformStockAdjustment(base)
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('defaults adjustedAt to epoch when no date field is present', () => {
    const { adjustmentDate, ...rest } = base
    const result = transformStockAdjustment(rest)
    expect(result.adjustedAt).toBe(new Date(0).toISOString())
  })

  it('falls back postedDate → adjustedAt when adjustmentDate is absent', () => {
    const { adjustmentDate, ...rest } = base
    const result = transformStockAdjustment({ ...rest, postedDate: '2024-04-01T00:00:00Z' })
    expect(result.adjustedAt).toBe('2024-04-01T00:00:00.000Z')
  })

  it('falls back date → adjustedAt when adjustmentDate and postedDate are absent', () => {
    const { adjustmentDate, ...rest } = base
    const result = transformStockAdjustment({ ...rest, date: '2024-05-01T00:00:00Z' })
    expect(result.adjustedAt).toBe('2024-05-01T00:00:00.000Z')
  })

  it('maps operatorName → adjustedBy', () => {
    const result = transformStockAdjustment(base)
    expect(result.adjustedBy).toBe('Jane Smith')
  })

  it('falls back adjustedBy when operatorName is absent', () => {
    const { operatorName, ...rest } = base
    const result = transformStockAdjustment({ ...rest, adjustedBy: 'John Doe' })
    expect(result.adjustedBy).toBe('John Doe')
  })

  it('falls back operatorId when operatorName and adjustedBy are absent', () => {
    const { operatorName, ...rest } = base
    const result = transformStockAdjustment({ ...rest, operatorId: 'op-007' })
    expect(result.adjustedBy).toBe('op-007')
  })

  it('maps line itemNo → productId', () => {
    const result = transformStockAdjustment(base)
    expect(result.lines[0]!.productId).toBe('ITEM-001')
  })

  it('maps line quantityChange → deltaQuantity', () => {
    const result = transformStockAdjustment(base)
    expect(result.lines[0]!.deltaQuantity).toBe(-5)
  })

  it('maps line countedQuantity → countedQuantity', () => {
    const result = transformStockAdjustment(base)
    expect(result.lines[0]!.countedQuantity).toBe(45)
  })

  it('maps line notes → notes', () => {
    const result = transformStockAdjustment(base)
    expect(result.lines[0]!.notes).toBe('Recount after discrepancy')
  })

  it('falls back delta → deltaQuantity when quantityChange is absent', () => {
    const result = transformStockAdjustment({
      ...base,
      lines: [{ itemNo: 'ITEM-002', delta: 10 }],
    })
    expect(result.lines[0]!.deltaQuantity).toBe(10)
  })

  it('falls back line comment → notes when notes is absent', () => {
    const result = transformStockAdjustment({
      ...base,
      lines: [{ itemNo: 'ITEM-002', quantityChange: 1, comment: 'fallback note' }],
    })
    expect(result.lines[0]!.notes).toBe('fallback note')
  })

  it('falls back branchNo → locationId when branchId is absent', () => {
    const { branchId, ...rest } = base
    const result = transformStockAdjustment({ ...rest, branchNo: 'BN-002' })
    expect(result.locationId).toBe('BN-002')
  })

  it('falls back id → id when adjustmentId is absent', () => {
    const { adjustmentId, ...rest } = base
    const result = transformStockAdjustment({ ...rest, id: 'ADJ-FALLBACK' })
    expect(result.id).toBe('ADJ-FALLBACK')
  })

  it('falls back adjustmentType → reason when reason is absent', () => {
    const { reason, ...rest } = base
    const result = transformStockAdjustment({ ...rest, adjustmentType: 'cycle' })
    expect(result.reason).toBe('cycle_count')
  })

  it('yields empty lines array when lines are absent', () => {
    const { lines, ...rest } = base
    const result = transformStockAdjustment(rest)
    expect(result.lines).toEqual([])
  })

  it('sets platform to "texada"', () => {
    const result = transformStockAdjustment(base)
    expect(result.platform).toBe('texada')
  })

  it('produces output that satisfies StockAdjustmentSchema', () => {
    const result = transformStockAdjustment(base)
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
