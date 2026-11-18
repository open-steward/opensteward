import { describe, it, expect } from 'vitest'
import { transformStockAdjustment } from '../../../../../../../src/verticals/inventory/adapters/3plcentral/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('transformStockAdjustment', () => {
  const raw = {
    adjustmentId: 7,
    facilityIdentifier: { id: 1, name: 'SF Warehouse' },
    adjustmentDate: '2024-03-01T00:00:00Z',
    userIdentifier: { name: 'Jane Doe' },
    lineItems: [
      {
        itemIdentifier: { id: 101 },
        adjustmentQty: -5,
        reason: 'cycle count',
      },
    ],
  }
  const result = transformStockAdjustment(raw)

  it('sets id from adjustmentId', () => {
    expect(result.id).toBe('7')
  })

  it('sets locationId to facility:<id>', () => {
    expect(result.locationId).toBe('facility:1')
  })

  it('maps reason "cycle count" → cycle_count', () => {
    expect(result.reason).toBe('cycle_count')
  })

  it('sets platform to 3plcentral', () => {
    expect(result.platform).toBe('3plcentral')
  })

  it('sets adjustedBy from userIdentifier.name', () => {
    expect(result.adjustedBy).toBe('Jane Doe')
  })

  it('maps line items correctly', () => {
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].deltaQuantity).toBe(-5)
    expect(result.lines[0].productId).toBe('101')
  })

  it('passes schema validation', () => {
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockAdjustment — reason mapping', () => {
  const makeRaw = (reason: string) => ({
    adjustmentId: 1,
    facilityIdentifier: { id: 1 },
    adjustmentDate: '2024-03-01T00:00:00Z',
    lineItems: [{ itemIdentifier: { id: 1 }, adjustmentQty: 0, reason }],
  })

  it('maps "damaged goods" → damage', () => {
    expect(transformStockAdjustment(makeRaw('damaged goods')).reason).toBe('damage')
  })

  it('maps "item found" → found', () => {
    expect(transformStockAdjustment(makeRaw('item found')).reason).toBe('found')
  })
})
