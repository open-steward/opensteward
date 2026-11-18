import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawD365PurchaseOrder,
  type RawD365PurchaseOrderLine,
} from '../../../../../../../src/verticals/inventory/adapters/dynamics-365-scm/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('dynamics-365-scm transformPurchaseOrder', () => {
  const line: RawD365PurchaseOrderLine = {
    PurchaseOrderNumber: 'PO-001',
    LineNumber: 1,
    ItemNumber: 'ITEM-001',
    PurchaseQuantity: 100,
    RemainPurchasePhysical: 60,
    PurchasePrice: 5.5,
    LineAmount: 550,
    WarehouseId: 'WH-001',
    DataAreaId: 'USMF',
  }

  const raw: RawD365PurchaseOrder = {
    PurchaseOrderNumber: 'PO-001',
    OrderVendorAccountNumber: 'VENDOR-001',
    PurchaseOrderStatus: 'Confirmed',
    CurrencyCode: 'USD',
    DeliveryAddressWarehouseId: 'WH-001',
    RequestedDeliveryDate: '2024-03-01T00:00:00.000Z',
    ConfirmedDeliveryDate: '2024-03-01T00:00:00.000Z',
    CreatedDateTime: '2024-03-01T00:00:00.000Z',
    DataAreaId: 'USMF',
    TotalInvoiceAmount: 550,
    PurchaseOrderLines: [line],
  }

  it('maps id and externalId from PurchaseOrderNumber', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('PO-001')
    expect(result.externalId).toBe('PO-001')
  })

  it('maps number from PurchaseOrderNumber', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.number).toBe('PO-001')
  })

  it('maps supplierId from OrderVendorAccountNumber', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.supplierId).toBe('VENDOR-001')
  })

  it('maps destinationLocationId from DeliveryAddressWarehouseId', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.destinationLocationId).toBe('WH-001')
  })

  it('maps status Confirmed to sent', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('sent')
  })

  it('maps status None to draft', () => {
    const result = transformPurchaseOrder({ ...raw, PurchaseOrderStatus: 'None' })
    expect(result.status).toBe('draft')
  })

  it('maps status Received to received', () => {
    const result = transformPurchaseOrder({ ...raw, PurchaseOrderStatus: 'Received' })
    expect(result.status).toBe('received')
  })

  it('maps status Invoiced to closed', () => {
    const result = transformPurchaseOrder({ ...raw, PurchaseOrderStatus: 'Invoiced' })
    expect(result.status).toBe('closed')
  })

  it('maps status Cancelled to cancelled', () => {
    const result = transformPurchaseOrder({ ...raw, PurchaseOrderStatus: 'Cancelled' })
    expect(result.status).toBe('cancelled')
  })

  it('converts TotalInvoiceAmount to minor units', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.totalAmount).toBe(55000)
    expect(result.subtotalAmount).toBe(55000)
  })

  it('maps currency from CurrencyCode', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.currency).toBe('USD')
  })

  it('maps expectedAt from ConfirmedDeliveryDate', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.expectedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps orderedAt from CreatedDateTime', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps line productId from ItemNumber', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines[0].productId).toBe('ITEM-001')
  })

  it('maps line quantityOrdered from PurchaseQuantity', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines[0].quantityOrdered).toBe(100)
  })

  it('computes line quantityReceived as ordered minus remain', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines[0].quantityReceived).toBe(40)
  })

  it('converts line PurchasePrice to minor units', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines[0].unitCost).toBe(550)
  })

  it('converts line LineAmount to minor units', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines[0].lineTotal).toBe(55000)
  })

  it('sets platform to dynamics-365-scm', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.platform).toBe('dynamics-365-scm')
  })

  it('produces output that satisfies PurchaseOrderSchema', () => {
    const result = transformPurchaseOrder(raw)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
