import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawSpsCommercePurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/sps-commerce/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('transformPurchaseOrder — sps-commerce', () => {
  const raw: RawSpsCommercePurchaseOrder = {
    po_id: 'SPS-PO-001',
    purchase_order_number: 'PO-1042',
    vendor_id: 'VEND-10',
    trading_partner_id: 'TP-999',
    status: 'SENT',
    currency_code: 'USD',
    subtotal_amount: 490000,
    total_amount: 500000,
    ship_to_location_id: 'LOC-001',
    ship_to_name: 'SF Warehouse',
    order_date: '2024-03-01T00:00:00Z',
    requested_ship_date: '2024-03-01T00:00:00Z',
    received_date: '2024-03-01T00:00:00Z',
    items: [
      {
        item_id: 'SPS-ITEM-01',
        quantity_ordered: 200,
        quantity_received: 100,
        unit_price: 2500,
        line_total: 500000,
      },
    ],
  }
  const result = transformPurchaseOrder(raw)

  it('maps id from po_id', () => {
    expect(result.id).toBe('SPS-PO-001')
  })

  it('maps number from purchase_order_number', () => {
    expect(result.number).toBe('PO-1042')
  })

  it('maps supplierId from vendor_id', () => {
    expect(result.supplierId).toBe('VEND-10')
  })

  it('maps destinationLocationId from ship_to_location_id', () => {
    expect(result.destinationLocationId).toBe('LOC-001')
  })

  it('maps status SENT to sent', () => {
    expect(result.status).toBe('sent')
  })

  it('maps currency from currency_code', () => {
    expect(result.currency).toBe('USD')
  })

  it('maps subtotalAmount', () => {
    expect(result.subtotalAmount).toBe(490000)
  })

  it('maps totalAmount', () => {
    expect(result.totalAmount).toBe(500000)
  })

  it('maps line productId from item_id', () => {
    expect(result.lines[0]?.productId).toBe('SPS-ITEM-01')
  })

  it('maps line quantityOrdered', () => {
    expect(result.lines[0]?.quantityOrdered).toBe(200)
  })

  it('maps line quantityReceived', () => {
    expect(result.lines[0]?.quantityReceived).toBe(100)
  })

  it('maps orderedAt from order_date', () => {
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps expectedAt from requested_ship_date', () => {
    expect(result.expectedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to sps-commerce', () => {
    expect(result.platform).toBe('sps-commerce')
  })

  it('passes schema validation', () => {
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})

describe('transformPurchaseOrder — sps-commerce status mapping', () => {
  const base: RawSpsCommercePurchaseOrder = {
    purchase_order_number: 'PO-BASE',
    vendor_id: 'V1',
  }

  it.each([
    ['NEW', 'draft'],
    ['DRAFT', 'draft'],
    ['ACKNOWLEDGED', 'sent'],
    ['PARTIALLY_RECEIVED', 'partially_received'],
    ['RECEIVED', 'received'],
    ['CLOSED', 'closed'],
    ['CANCELLED', 'cancelled'],
    ['VOIDED', 'cancelled'],
    ['BOGUS', 'draft'],
  ] as const)('maps status "%s" to "%s"', (status, expected) => {
    const result = transformPurchaseOrder({ ...base, status })
    expect(result.status).toBe(expected)
  })
})

describe('transformPurchaseOrder — sps-commerce fallback id to PO number', () => {
  const raw: RawSpsCommercePurchaseOrder = {
    purchase_order_number: 'PO-FALLBACK',
    vendor_id: 'V2',
  }
  const result = transformPurchaseOrder(raw)

  it('falls back id to purchase_order_number when po_id absent', () => {
    expect(result.id).toBe('PO-FALLBACK')
  })
})
