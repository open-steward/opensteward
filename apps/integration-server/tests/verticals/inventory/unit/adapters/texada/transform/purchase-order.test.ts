import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawTexadaPurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/texada/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('transformPurchaseOrder', () => {
  const base: RawTexadaPurchaseOrder = {
    purchaseOrderId: 'PO-001',
    purchaseOrderNo: 'PO-2024-001',
    vendorId: 'vendor-42',
    branchId: 'branch-001',
    status: 'ORDERED',
    currency: 'USD',
    subTotal: 450.0,
    totalAmount: 495.0,
    orderDate: '2024-03-01T00:00:00Z',
    expectedDeliveryDate: '2024-03-15T00:00:00Z',
    receivedDate: '2024-03-14T00:00:00Z',
    lines: [
      {
        itemNo: 'ITEM-001',
        quantity: 5,
        quantityReceived: 3,
        unitCost: 90.0,
        lineTotal: 450.0,
      },
    ],
  }

  it('maps purchaseOrderId → id and externalId', () => {
    const result = transformPurchaseOrder(base)
    expect(result.id).toBe('PO-001')
    expect(result.externalId).toBe('PO-001')
  })

  it('maps purchaseOrderNo → number', () => {
    const result = transformPurchaseOrder(base)
    expect(result.number).toBe('PO-2024-001')
  })

  it('maps vendorId → supplierId', () => {
    const result = transformPurchaseOrder(base)
    expect(result.supplierId).toBe('vendor-42')
  })

  it('maps branchId → destinationLocationId', () => {
    const result = transformPurchaseOrder(base)
    expect(result.destinationLocationId).toBe('branch-001')
  })

  it('maps ORDERED status → "sent"', () => {
    const result = transformPurchaseOrder(base)
    expect(result.status).toBe('sent')
  })

  it('maps DRAFT status → "draft"', () => {
    const result = transformPurchaseOrder({ ...base, status: 'DRAFT' })
    expect(result.status).toBe('draft')
  })

  it('maps NEW status → "draft"', () => {
    const result = transformPurchaseOrder({ ...base, status: 'NEW' })
    expect(result.status).toBe('draft')
  })

  it('maps PARTIAL status → "partially_received"', () => {
    const result = transformPurchaseOrder({ ...base, status: 'PARTIAL' })
    expect(result.status).toBe('partially_received')
  })

  it('maps PARTIALLY RECEIVED status → "partially_received"', () => {
    const result = transformPurchaseOrder({ ...base, status: 'PARTIALLY RECEIVED' })
    expect(result.status).toBe('partially_received')
  })

  it('maps RECEIVED status → "received"', () => {
    const result = transformPurchaseOrder({ ...base, status: 'RECEIVED' })
    expect(result.status).toBe('received')
  })

  it('maps COMPLETED status → "closed"', () => {
    const result = transformPurchaseOrder({ ...base, status: 'COMPLETED' })
    expect(result.status).toBe('closed')
  })

  it('maps VOIDED status → "cancelled"', () => {
    const result = transformPurchaseOrder({ ...base, status: 'VOIDED' })
    expect(result.status).toBe('cancelled')
  })

  it('maps CANCELLED status → "cancelled"', () => {
    const result = transformPurchaseOrder({ ...base, status: 'CANCELLED' })
    expect(result.status).toBe('cancelled')
  })

  it('defaults unknown status → "draft"', () => {
    const result = transformPurchaseOrder({ ...base, status: 'UNKNOWN_STATUS' })
    expect(result.status).toBe('draft')
  })

  it('converts subTotal dollars to minor units', () => {
    const result = transformPurchaseOrder(base)
    expect(result.subtotalAmount).toBe(45000)
  })

  it('converts totalAmount dollars to minor units', () => {
    const result = transformPurchaseOrder(base)
    expect(result.totalAmount).toBe(49500)
  })

  it('converts line unitCost dollars to minor units', () => {
    const result = transformPurchaseOrder(base)
    expect(result.lines[0]!.unitCost).toBe(9000)
  })

  it('converts line lineTotal dollars to minor units', () => {
    const result = transformPurchaseOrder(base)
    expect(result.lines[0]!.lineTotal).toBe(45000)
  })

  it('maps line itemNo → productId', () => {
    const result = transformPurchaseOrder(base)
    expect(result.lines[0]!.productId).toBe('ITEM-001')
  })

  it('maps line quantity → quantityOrdered', () => {
    const result = transformPurchaseOrder(base)
    expect(result.lines[0]!.quantityOrdered).toBe(5)
  })

  it('maps line quantityReceived → quantityReceived', () => {
    const result = transformPurchaseOrder(base)
    expect(result.lines[0]!.quantityReceived).toBe(3)
  })

  it('maps orderDate → orderedAt as ISO string', () => {
    const result = transformPurchaseOrder(base)
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps expectedDeliveryDate → expectedAt as ISO string', () => {
    const result = transformPurchaseOrder(base)
    expect(result.expectedAt).toBe('2024-03-15T00:00:00.000Z')
  })

  it('maps receivedDate → receivedAt as ISO string', () => {
    const result = transformPurchaseOrder(base)
    expect(result.receivedAt).toBe('2024-03-14T00:00:00.000Z')
  })

  it('falls back poId → id when purchaseOrderId is absent', () => {
    const { purchaseOrderId, ...rest } = base
    const result = transformPurchaseOrder({ ...rest, poId: 'PO-ALT-001' })
    expect(result.id).toBe('PO-ALT-001')
  })

  it('falls back vendorNo → supplierId when vendorId is absent', () => {
    const { vendorId, ...rest } = base
    const result = transformPurchaseOrder({ ...rest, vendorNo: 'VN-99' })
    expect(result.supplierId).toBe('VN-99')
  })

  it('falls back currencyCode → currency when currency is absent', () => {
    const { currency, ...rest } = base
    const result = transformPurchaseOrder({ ...rest, currencyCode: 'CAD' })
    expect(result.currency).toBe('CAD')
  })

  it('falls back orderStatus when status is absent', () => {
    const { status, ...rest } = base
    const result = transformPurchaseOrder({ ...rest, orderStatus: 'SENT' })
    expect(result.status).toBe('sent')
  })

  it('yields empty lines array when lines are absent', () => {
    const { lines, ...rest } = base
    const result = transformPurchaseOrder(rest)
    expect(result.lines).toEqual([])
  })

  it('sets platform to "texada"', () => {
    const result = transformPurchaseOrder(base)
    expect(result.platform).toBe('texada')
  })

  it('produces output that satisfies PurchaseOrderSchema', () => {
    const result = transformPurchaseOrder(base)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
