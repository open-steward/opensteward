import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawPulpoWmsStockLevel,
} from '../../../../../../../src/verticals/inventory/adapters/pulpo-wms/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('pulpo-wms transformStockLevel', () => {
  const raw: RawPulpoWmsStockLevel = {
    product_id: 'prod-001',
    warehouse_id: 'wh-001',
    warehouse_code: 'MAIN',
    quantity_on_hand: 250,
    quantity_available: 240,
    quantity_committed: 10,
    quantity_incoming: 100,
    quantity_outgoing: 5,
    reorder_point: 50,
    reorder_quantity: 200,
    last_counted_at: '2024-03-01T00:00:00Z',
    lots: [
      {
        lot_number: 'LOT-2024-01',
        quantity: 250,
        expiry_date: '2025-01-01T00:00:00Z',
      },
    ],
  }

  it('constructs synthetic id as product_id:warehouse_id', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('prod-001:wh-001')
    expect(result.productId).toBe('prod-001')
    expect(result.locationId).toBe('wh-001')
  })

  it('falls back to warehouse_code when warehouse_id is absent', () => {
    const result = transformStockLevel({ ...raw, warehouse_id: undefined })
    expect(result.id).toBe('prod-001:MAIN')
    expect(result.locationId).toBe('MAIN')
  })

  it('maps quantity fields', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(250)
    expect(result.quantityAvailable).toBe(240)
    expect(result.quantityCommitted).toBe(10)
    expect(result.quantityIncoming).toBe(100)
    expect(result.quantityOutgoing).toBe(5)
  })

  it('maps reorderPoint and reorderQuantity', () => {
    const result = transformStockLevel(raw)
    expect(result.reorderPoint).toBe(50)
    expect(result.reorderQuantity).toBe(200)
  })

  it('maps lastCountedAt as ISO string', () => {
    const result = transformStockLevel(raw)
    expect(result.lastCountedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps lots with lot, quantity and expiresAt', () => {
    const result = transformStockLevel(raw)
    expect(result.lots).toHaveLength(1)
    expect(result.lots![0]!.lot).toBe('LOT-2024-01')
    expect(result.lots![0]!.quantity).toBe(250)
    expect(result.lots![0]!.expiresAt).toBe('2025-01-01T00:00:00.000Z')
  })

  it('omits lots when lots array is absent', () => {
    const result = transformStockLevel({ ...raw, lots: undefined })
    expect(result.lots).toBeUndefined()
  })

  it('produces output that satisfies StockLevelSchema', () => {
    const result = transformStockLevel(raw)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
