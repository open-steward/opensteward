import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawStoreFeederPurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/store-feeder/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('transformPurchaseOrder — store-feeder', () => {
  const raw: RawStoreFeederPurchaseOrder = {
    PurchaseOrderID: 5001,
    PurchaseOrderGuid: 'po-guid-abc',
    PurchaseOrderReference: 'PO-1042',
    PaymentReference: 'PAY-999',
    DateRaised: '2024-03-01T00:00:00Z',
    DateSent: '2024-03-01T00:00:00Z',
    DateDue: '2024-03-01T00:00:00Z',
    Supplier: { SupplierID: 10, Name: 'Keyboards Inc' },
    Warehouse: { WarehouseID: 101, WarehouseName: 'Main WH' },
    Subtotal: 490.0,
    Total: 500.0,
    Currency: { CurrencyCode: 'GBP' },
    PurchaseOrderStatus: 'Sent',
    PurchaseOrderLines: [
      {
        ProductID: 12345,
        QtyOrdered: 200,
        QtyReceived: 100,
        SinglePrice: 2.5,
        LineTotal: 500.0,
      },
    ],
  }
  const result = transformPurchaseOrder(raw)

  it('maps id from PurchaseOrderID as string', () => {
    expect(result.id).toBe('5001')
  })

  it('maps number from PurchaseOrderReference', () => {
    expect(result.number).toBe('PO-1042')
  })

  it('maps supplierId from Supplier.SupplierID as string', () => {
    expect(result.supplierId).toBe('10')
  })

  it('maps destinationLocationId from Warehouse.WarehouseID as string', () => {
    expect(result.destinationLocationId).toBe('101')
  })

  it('maps status "Sent" to sent', () => {
    expect(result.status).toBe('sent')
  })

  it('maps currency from Currency.CurrencyCode', () => {
    expect(result.currency).toBe('GBP')
  })

  it('maps subtotalAmount from Subtotal', () => {
    expect(result.subtotalAmount).toBe(490.0)
  })

  it('maps totalAmount from Total', () => {
    expect(result.totalAmount).toBe(500.0)
  })

  it('maps line productId from ProductID as string', () => {
    expect(result.lines[0]?.productId).toBe('12345')
  })

  it('maps line quantityOrdered from QtyOrdered', () => {
    expect(result.lines[0]?.quantityOrdered).toBe(200)
  })

  it('maps line quantityReceived from QtyReceived', () => {
    expect(result.lines[0]?.quantityReceived).toBe(100)
  })

  it('maps line unitCost from SinglePrice', () => {
    expect(result.lines[0]?.unitCost).toBe(2.5)
  })

  it('maps orderedAt from DateRaised', () => {
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps expectedAt from DateDue', () => {
    expect(result.expectedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to store-feeder', () => {
    expect(result.platform).toBe('store-feeder')
  })

  it('passes schema validation', () => {
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})

describe('transformPurchaseOrder — store-feeder status mapping', () => {
  const base: RawStoreFeederPurchaseOrder = {
    PurchaseOrderID: 1,
    Supplier: { SupplierID: 1 },
  }

  it.each([
    ['Draft', 'draft'],
    ['Raised', 'draft'],
    ['Sent', 'sent'],
    ['Partially Received', 'partially_received'],
    ['Received', 'received'],
    ['Complete', 'closed'],
    ['Cancelled', 'cancelled'],
    ['Voided', 'cancelled'],
    ['Unknown', 'draft'],
  ] as const)('maps status "%s" to "%s"', (status, expected) => {
    const result = transformPurchaseOrder({ ...base, PurchaseOrderStatus: status })
    expect(result.status).toBe(expected)
  })
})
