import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawOpenbravoOrder,
} from '../../../../../../../src/verticals/inventory/adapters/openbravo/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('openbravo transformPurchaseOrder', () => {
  const raw: RawOpenbravoOrder = {
    id: 'order-uuid-001',
    documentNo: 'PO-2024-001',
    documentStatus: 'CO',
    businessPartner: { id: 'bp-001', _identifier: 'Keyboards Inc' },
    warehouse: { id: 'wh-001' },
    currency: { _identifier: 'USD' },
    grandTotalAmt: 500000,
    sumLineNetAmt: 480000,
    orderDate: '2024-03-01T00:00:00Z',
    scheduledDeliveryDate: '2024-03-01T00:00:00Z',
    orderLineList: [
      {
        id: 'ol-001',
        product: { id: 'prod-001' },
        orderedQuantity: 100,
        deliveredQuantity: 50,
        unitPrice: 4999,
        lineNetAmt: 499900,
      },
    ],
  }

  it('maps id and externalId', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('order-uuid-001')
    expect(result.externalId).toBe('order-uuid-001')
  })

  it('maps number from documentNo', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.number).toBe('PO-2024-001')
  })

  it('maps supplierId from businessPartner.id', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.supplierId).toBe('bp-001')
  })

  it('maps destinationLocationId from warehouse.id', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.destinationLocationId).toBe('wh-001')
  })

  it('maps CO documentStatus to sent', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('sent')
  })

  it('maps DR documentStatus to draft', () => {
    const result = transformPurchaseOrder({ ...raw, documentStatus: 'DR' })
    expect(result.status).toBe('draft')
  })

  it('maps CL documentStatus to closed', () => {
    const result = transformPurchaseOrder({ ...raw, documentStatus: 'CL' })
    expect(result.status).toBe('closed')
  })

  it('maps VO documentStatus to cancelled', () => {
    const result = transformPurchaseOrder({ ...raw, documentStatus: 'VO' })
    expect(result.status).toBe('cancelled')
  })

  it('maps currency from currency._identifier', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.currency).toBe('USD')
  })

  it('maps totalAmount from grandTotalAmt', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.totalAmount).toBe(500000)
  })

  it('maps line items', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('prod-001')
    expect(result.lines[0]!.quantityOrdered).toBe(100)
    expect(result.lines[0]!.quantityReceived).toBe(50)
    expect(result.lines[0]!.unitCost).toBe(4999)
  })

  it('maps orderedAt from orderDate', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps expectedAt from scheduledDeliveryDate', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.expectedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to openbravo', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.platform).toBe('openbravo')
  })

  it('produces output that satisfies PurchaseOrderSchema', () => {
    const result = transformPurchaseOrder(raw)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
