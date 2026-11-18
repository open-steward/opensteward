import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawPulpoWmsPurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/pulpo-wms/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('pulpo-wms transformPurchaseOrder', () => {
  const raw: RawPulpoWmsPurchaseOrder = {
    id: 'po-001',
    number: 'PO-1042',
    reference: 'REF-001',
    supplier_id: 'sup-01',
    supplier_name: 'ACME Corp',
    status: 'sent',
    currency: 'EUR',
    subtotal: 50000,
    total: 52000,
    destination_warehouse_id: 'wh-001',
    lines: [
      {
        product_id: 'prod-001',
        quantity_ordered: 100,
        quantity_received: 50,
        unit_price: 500,
        line_total: 50000,
      },
    ],
    ordered_at: '2024-03-01T00:00:00Z',
    expected_at: '2024-03-15T00:00:00Z',
    received_at: '2024-03-20T00:00:00Z',
  }

  it('maps id and supplierId', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('po-001')
    expect(result.supplierId).toBe('sup-01')
  })

  it('maps number and falls back to reference', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.number).toBe('PO-1042')

    const noNumber = transformPurchaseOrder({ ...raw, number: undefined })
    expect(noNumber.number).toBe('REF-001')
  })

  it('maps status correctly for "sent"', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('sent')
  })

  it('maps various status values', () => {
    expect(transformPurchaseOrder({ ...raw, status: 'draft' }).status).toBe('draft')
    expect(transformPurchaseOrder({ ...raw, status: 'ordered' }).status).toBe('sent')
    expect(transformPurchaseOrder({ ...raw, status: 'confirmed' }).status).toBe('sent')
    expect(transformPurchaseOrder({ ...raw, status: 'partial' }).status).toBe('partially_received')
    expect(transformPurchaseOrder({ ...raw, status: 'partially_received' }).status).toBe(
      'partially_received',
    )
    expect(transformPurchaseOrder({ ...raw, status: 'received' }).status).toBe('received')
    expect(transformPurchaseOrder({ ...raw, status: 'completed' }).status).toBe('closed')
    expect(transformPurchaseOrder({ ...raw, status: 'cancelled' }).status).toBe('cancelled')
    expect(transformPurchaseOrder({ ...raw, status: 'voided' }).status).toBe('cancelled')
  })

  it('maps line items', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('prod-001')
    expect(result.lines[0]!.quantityOrdered).toBe(100)
    expect(result.lines[0]!.quantityReceived).toBe(50)
    expect(result.lines[0]!.unitCost).toBe(500)
    expect(result.lines[0]!.lineTotal).toBe(50000)
  })

  it('maps destinationLocationId', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.destinationLocationId).toBe('wh-001')
  })

  it('maps orderedAt, expectedAt, receivedAt as ISO strings', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.expectedAt).toBe('2024-03-15T00:00:00.000Z')
    expect(result.receivedAt).toBe('2024-03-20T00:00:00.000Z')
  })

  it('falls back supplierId to supplier_name when supplier_id is absent', () => {
    const result = transformPurchaseOrder({ ...raw, supplier_id: undefined })
    expect(result.supplierId).toBe('ACME Corp')
  })

  it('produces output that satisfies PurchaseOrderSchema', () => {
    const result = transformPurchaseOrder(raw)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
