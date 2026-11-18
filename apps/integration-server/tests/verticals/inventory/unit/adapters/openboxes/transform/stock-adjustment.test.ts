import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawOpenboxesStockAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/openboxes/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('openboxes transformStockAdjustment', () => {
  const raw: RawOpenboxesStockAdjustment = {
    id: 'tx-001',
    location: { id: 'loc-001', name: 'Main Warehouse' },
    transactionType: {
      id: 'tt-1',
      name: 'Credit',
      transactionCode: 'CREDIT',
    },
    transactionEntries: [
      {
        id: 'te-001',
        product: { id: 'prod-001', productCode: 'WK-2026' },
        inventoryItem: { id: 'ii-001', lotNumber: 'LOT-001' },
        quantity: 10,
        quantityOnHand: 250,
      },
    ],
    transactionDate: '2024-03-01T00:00:00Z',
    createdBy: { id: 'user-1', name: 'Jane Doe' },
    comment: 'Stock correction',
  }

  it('maps id and externalId', () => {
    const result = transformStockAdjustment(raw)
    expect(result.id).toBe('tx-001')
    expect(result.externalId).toBe('tx-001')
  })

  it('maps locationId from location.id', () => {
    const result = transformStockAdjustment(raw)
    expect(result.locationId).toBe('loc-001')
  })

  it('maps CREDIT transactionCode to correction reason', () => {
    const result = transformStockAdjustment(raw)
    expect(result.reason).toBe('correction')
  })

  it('maps INVENTORY transactionCode to cycle_count reason', () => {
    const result = transformStockAdjustment({
      ...raw,
      transactionType: { id: 'tt-2', name: 'Inventory', transactionCode: 'INVENTORY' },
    })
    expect(result.reason).toBe('cycle_count')
  })

  it('maps lines with productId and deltaQuantity', () => {
    const result = transformStockAdjustment(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('prod-001')
    expect(result.lines[0]!.deltaQuantity).toBe(10)
    expect(result.lines[0]!.countedQuantity).toBe(250)
  })

  it('maps adjustedAt from transactionDate', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps adjustedBy from createdBy.name', () => {
    const result = transformStockAdjustment(raw)
    expect(result.adjustedBy).toBe('Jane Doe')
  })

  it('sets platform to openboxes', () => {
    const result = transformStockAdjustment(raw)
    expect(result.platform).toBe('openboxes')
  })

  it('produces output that satisfies StockAdjustmentSchema', () => {
    const result = transformStockAdjustment(raw)
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
