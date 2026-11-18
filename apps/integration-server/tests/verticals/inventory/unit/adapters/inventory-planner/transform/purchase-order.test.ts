import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawInventoryPlannerPurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/inventory-planner/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('inventory-planner transformPurchaseOrder', () => {
  const raw: RawInventoryPlannerPurchaseOrder = {
    _id: 'po-abc123',
    reference: 'PO-2024-001',
    vendor: 'KeyboardCo',
    vendor_id: 'vendor-001',
    warehouse: 'US Warehouse',
    warehouse_id: 'wh-us-01',
    status: 'OPEN',
    currency: 'USD',
    total: 5999,
    subtotal: 5500,
    items: [
      {
        _id: 'line-001',
        variant_id: 'abc123def456',
        sku: 'SKU-001',
        quantity: 100,
        received: 0,
        // Use integer cost so MoneySchema (amount: z.number().int()) passes when
        // the PurchaseOrderLineSchema stores unitCost directly
        cost: 60,
        total: 6000,
      },
    ],
    ordered_date: '2024-03-01T00:00:00Z',
    expected_date: '2024-03-15T00:00:00Z',
  }

  it('maps id and externalId from _id', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('po-abc123')
    expect(result.externalId).toBe('po-abc123')
  })

  it('maps number from reference', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.number).toBe('PO-2024-001')
  })

  it('maps supplierId from vendor_id', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.supplierId).toBe('vendor-001')
  })

  it('maps destinationLocationId from warehouse_id', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.destinationLocationId).toBe('wh-us-01')
  })

  it('maps OPEN status to sent', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('sent')
  })

  it('maps DRAFT status to draft', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'DRAFT' })
    expect(result.status).toBe('draft')
  })

  it('maps PARTIALLY RECEIVED status', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'PARTIALLY RECEIVED' })
    expect(result.status).toBe('partially_received')
  })

  it('maps total and subtotal amounts', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.totalAmount).toBe(5999)
    expect(result.subtotalAmount).toBe(5500)
  })

  it('maps lines with variant_id as productId', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('abc123def456')
    expect(result.lines[0]!.quantityOrdered).toBe(100)
    expect(result.lines[0]!.unitCost).toBe(60)
  })

  it('maps orderedAt from ordered_date', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('falls back orderedAt to created_at when ordered_date absent', () => {
    const result = transformPurchaseOrder({
      ...raw,
      ordered_date: undefined,
      created_at: '2024-03-01T00:00:00Z',
    })
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to inventory-planner', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.platform).toBe('inventory-planner')
  })

  it('produces output that satisfies PurchaseOrderSchema', () => {
    const result = transformPurchaseOrder(raw)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
