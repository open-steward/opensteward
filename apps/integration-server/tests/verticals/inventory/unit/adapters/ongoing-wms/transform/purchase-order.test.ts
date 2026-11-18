import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawOngoingWmsPurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/ongoing-wms/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('ongoing-wms transformPurchaseOrder', () => {
  const raw: RawOngoingWmsPurchaseOrder = {
    goodsOwner: { id: 1, name: 'Acme' },
    supplierInfo: { supplierNumber: 'SUP-99', supplierName: 'Keyboards Inc' },
    purchaseOrderInfo: {
      purchaseOrderId: 1042,
      purchaseOrderNumber: 'PO-1042',
      supplierOrderNumber: 'SO-999',
      goodsOwnerReference: 'REF-ABC',
      referenceNumber: 'REF-XYZ',
      purchaseOrderStatus: { number: 20, text: 'Processing' },
      inDate: '2024-03-01T00:00:00Z',
    },
    purchaseOrderLines: [
      {
        id: 1,
        rowNumber: '1',
        article: {
          articleSystemId: 18068,
          articleNumber: 'ART-001',
          articleName: 'Wireless Keyboard',
        },
        advisedNumberOfItems: 100,
        receivedNumberOfItems: 50,
      },
    ],
  }

  it('maps id and externalId from purchaseOrderId', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('1042')
    expect(result.externalId).toBe('1042')
  })

  it('maps number from purchaseOrderNumber', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.number).toBe('PO-1042')
  })

  it('maps supplierId from supplierNumber', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.supplierId).toBe('SUP-99')
  })

  it('maps status 20 to sent', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('sent')
  })

  it('maps status 10 to draft', () => {
    const result = transformPurchaseOrder({
      ...raw,
      purchaseOrderInfo: { ...raw.purchaseOrderInfo, purchaseOrderStatus: { number: 10 } },
    })
    expect(result.status).toBe('draft')
  })

  it('maps status 40 to partially_received', () => {
    const result = transformPurchaseOrder({
      ...raw,
      purchaseOrderInfo: { ...raw.purchaseOrderInfo, purchaseOrderStatus: { number: 40 } },
    })
    expect(result.status).toBe('partially_received')
  })

  it('maps status 100 to received', () => {
    const result = transformPurchaseOrder({
      ...raw,
      purchaseOrderInfo: { ...raw.purchaseOrderInfo, purchaseOrderStatus: { number: 100 } },
    })
    expect(result.status).toBe('received')
  })

  it('maps status 900 to cancelled', () => {
    const result = transformPurchaseOrder({
      ...raw,
      purchaseOrderInfo: { ...raw.purchaseOrderInfo, purchaseOrderStatus: { number: 900 } },
    })
    expect(result.status).toBe('cancelled')
  })

  it('maps line items from purchaseOrderLines', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('18068')
    expect(result.lines[0]!.quantityOrdered).toBe(100)
    expect(result.lines[0]!.quantityReceived).toBe(50)
  })

  it('maps expectedAt from inDate', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.expectedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to ongoing-wms', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.platform).toBe('ongoing-wms')
  })

  it('produces output that satisfies PurchaseOrderSchema', () => {
    const result = transformPurchaseOrder(raw)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
