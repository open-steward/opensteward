import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawSkuNexusPurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/skunexus/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('skunexus transformPurchaseOrder', () => {
  const raw: RawSkuNexusPurchaseOrder = {
    id: 'PO-1',
    order_number: 'PO-2024-001',
    vendor_id: 'V10',
    vendor_name: 'Acme Corp',
    status: 'ordered',
    currency: 'USD',
    subtotal: 450,
    total: 500,
    destination_location_id: 'LOC-5',
    line_items: [
      {
        id: 'LI-1',
        product_id: 'PROD-1',
        quantity_ordered: 10,
        quantity_received: 5,
        unit_cost: 45,
        line_total: 450,
      },
    ],
    ordered_at: '2024-03-01T00:00:00Z',
    expected_at: '2024-03-15T00:00:00Z',
  }

  it('maps id, number, and supplierId', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('PO-1')
    expect(result.number).toBe('PO-2024-001')
    expect(result.supplierId).toBe('V10')
    expect(result.platform).toBe('skunexus')
  })

  it('maps status "ordered" to "sent"', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('sent')
  })

  it('maps status "partially_received" to "partially_received"', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'partially_received' })
    expect(result.status).toBe('partially_received')
  })

  it('maps status "cancelled" to "cancelled"', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'cancelled' })
    expect(result.status).toBe('cancelled')
  })

  it('maps line items correctly', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('PROD-1')
    expect(result.lines[0]!.quantityOrdered).toBe(10)
    expect(result.lines[0]!.quantityReceived).toBe(5)
  })

  it('maps destinationLocationId', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.destinationLocationId).toBe('LOC-5')
  })

  it('maps orderedAt and expectedAt as ISO strings', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.expectedAt).toBe('2024-03-15T00:00:00.000Z')
  })

  it('produces output satisfying PurchaseOrderSchema', () => {
    const result = transformPurchaseOrder(raw)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })

  it('defaults supplierId to vendor_name when vendor_id is null', () => {
    const result = transformPurchaseOrder({ ...raw, vendor_id: null })
    expect(result.supplierId).toBe('Acme Corp')
  })
})
