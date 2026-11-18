import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawWebgilityInvoice,
} from '../../../../../../../src/verticals/inventory/adapters/webgility/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

const rawInvoice: RawWebgilityInvoice = {
  InvoiceId: 'inv-001',
  InvoiceNumber: 'INV-2024-001',
  InvoiceDate: '2024-03-01T00:00:00Z',
  DueDate: '2024-03-15T00:00:00Z',
  Status: 'AUTHORISED',
  SubTotal: 200,
  Total: 220,
  TotalTax: 20,
  Currency: 'USD',
  Customer: {
    CustomerId: 'cust-99',
    Name: 'Acme Vendor',
  },
  InvoiceLines: [
    {
      Id: 'line-1',
      ItemId: 'item-123',
      Quantity: 10,
      UnitPrice: 20,
      LineAmount: 200,
    },
  ],
  Payments: [
    {
      PaymentId: 'pay-1',
      PaymentDate: '2024-03-10T00:00:00Z',
      PaymentAmount: 220,
    },
  ],
}

describe('webgility transformPurchaseOrder', () => {
  it('maps InvoiceId to id', () => {
    const result = transformPurchaseOrder(rawInvoice)
    expect(result.id).toBe('inv-001')
    expect(result.externalId).toBe('inv-001')
  })

  it('maps InvoiceNumber to number', () => {
    const result = transformPurchaseOrder(rawInvoice)
    expect(result.number).toBe('INV-2024-001')
  })

  it('maps Customer.CustomerId to supplierId', () => {
    const result = transformPurchaseOrder(rawInvoice)
    expect(result.supplierId).toBe('cust-99')
  })

  it('maps AUTHORISED status to "sent"', () => {
    const result = transformPurchaseOrder(rawInvoice)
    expect(result.status).toBe('sent')
  })

  it('maps InvoiceDate to orderedAt', () => {
    const result = transformPurchaseOrder(rawInvoice)
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps DueDate to expectedAt', () => {
    const result = transformPurchaseOrder(rawInvoice)
    expect(result.expectedAt).toBe('2024-03-15T00:00:00.000Z')
  })

  it('maps last payment date to receivedAt', () => {
    const result = transformPurchaseOrder(rawInvoice)
    expect(result.receivedAt).toBe('2024-03-10T00:00:00.000Z')
  })

  it('maps Currency to currency', () => {
    const result = transformPurchaseOrder(rawInvoice)
    expect(result.currency).toBe('USD')
  })

  it('maps SubTotal and Total to subtotalAmount and totalAmount', () => {
    const result = transformPurchaseOrder(rawInvoice)
    expect(result.subtotalAmount).toBe(200)
    expect(result.totalAmount).toBe(220)
  })

  it('maps InvoiceLines to lines correctly', () => {
    const result = transformPurchaseOrder(rawInvoice)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('item-123')
    expect(result.lines[0]!.quantityOrdered).toBe(10)
    expect(result.lines[0]!.unitCost).toBe(20)
    expect(result.lines[0]!.lineTotal).toBe(200)
  })

  it('sets platform=webgility', () => {
    const result = transformPurchaseOrder(rawInvoice)
    expect(result.platform).toBe('webgility')
  })

  // NOTE: subtotalAmount and totalAmount are raw floats (not integer minor units).
  // PurchaseOrderSchema allows z.number() for these fields (not Amount.int()),
  // so schema validation should pass.
  it('produces a schema-valid PurchaseOrder', () => {
    const result = transformPurchaseOrder(rawInvoice)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })

  it('maps DRAFT status to "draft"', () => {
    const result = transformPurchaseOrder({ ...rawInvoice, Status: 'DRAFT' })
    expect(result.status).toBe('draft')
  })

  it('maps PAID status to "received"', () => {
    const result = transformPurchaseOrder({ ...rawInvoice, Status: 'PAID' })
    expect(result.status).toBe('received')
  })
})
