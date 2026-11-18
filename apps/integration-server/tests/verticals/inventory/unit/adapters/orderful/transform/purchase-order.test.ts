import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawOrderfulTransaction,
} from '../../../../../../../src/verticals/inventory/adapters/orderful/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('transformPurchaseOrder — orderful', () => {
  const raw: RawOrderfulTransaction = {
    id: 'txn_8001',
    type: { name: '850_PURCHASE_ORDER' },
    stream: 'live',
    businessNumber: 'BN-42',
    sender: { ediAccountId: 101, organizationName: 'Supplier Corp', liveIsaId: 'ISA-101' },
    receiver: { ediAccountId: 202, organizationName: 'Buyer Corp' },
    deliveryStatus: 'DELIVERED',
    acknowledgmentStatus: 'ACCEPTED',
    validationStatus: 'VALID',
    createdAt: '2024-03-01T00:00:00Z',
    message: {
      heading: {
        purchaseOrderNumber: 'PO-2024-001',
        purchaseOrderDate: '2024-03-01T00:00:00Z',
        buyersCurrency: { code: 'USD' },
        parties: {
          shipTo: {
            entityId: 'LOC-SHIP-1',
            organizationName: 'Ship Warehouse',
          },
        },
        monetaryAmounts: [{ qualifier: 'TT', amount: 500.0 }],
        dates: [{ qualifier: 'DEL', date: '2024-03-01T00:00:00Z' }],
      },
      detail: [
        {
          purchaseOrderLineId: 'L1',
          quantity: { value: 10, unitOfMeasure: 'EA' },
          unitCostPrice: 50.0,
          productIds: { buyerItemNumber: 'ITEM-001', gtin: '0123456789012' },
          productAttributes: { description: 'Keyboard' },
        },
      ],
    },
  }
  const result = transformPurchaseOrder(raw)

  it('maps id from txn.id as string', () => {
    expect(result.id).toBe('txn_8001')
  })

  it('maps number from heading.purchaseOrderNumber', () => {
    expect(result.number).toBe('PO-2024-001')
  })

  it('maps supplierId from sender.ediAccountId as string', () => {
    expect(result.supplierId).toBe('101')
  })

  it('maps destinationLocationId from shipTo.entityId', () => {
    expect(result.destinationLocationId).toBe('LOC-SHIP-1')
  })

  it('maps status received when acknowledgmentStatus is ACCEPTED', () => {
    expect(result.status).toBe('received')
  })

  it('maps currency from buyersCurrency.code', () => {
    expect(result.currency).toBe('USD')
  })

  it('maps totalAmount from TT monetary amount', () => {
    expect(result.totalAmount).toBe(500.0)
  })

  it('maps lines with productId and quantityOrdered', () => {
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('ITEM-001')
    expect(result.lines[0]!.quantityOrdered).toBe(10)
    expect(result.lines[0]!.unitCost).toBe(50.0)
  })

  it('maps expectedAt from DEL date', () => {
    expect(result.expectedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to orderful', () => {
    expect(result.platform).toBe('orderful')
  })

  it('passes schema validation', () => {
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})

describe('transformPurchaseOrder — orderful status mapping', () => {
  const cases: Array<[string | undefined, string | undefined, string]> = [
    ['PENDING', undefined, 'draft'],
    ['DELIVERED', undefined, 'sent'],
    ['SENT', undefined, 'sent'],
    ['FAILED', undefined, 'cancelled'],
    [undefined, 'REJECTED', 'cancelled'],
    ['DELIVERED', 'ACCEPTED', 'received'],
    ['DELIVERED', 'ACCEPTED_WITH_ERRORS', 'received'],
  ]

  for (const [deliveryStatus, ackStatus, expected] of cases) {
    it(`maps deliveryStatus="${deliveryStatus}" ackStatus="${ackStatus}" → "${expected}"`, () => {
      const raw: RawOrderfulTransaction = {
        id: 1,
        sender: { liveIsaId: 'ISA-1' },
        deliveryStatus,
        acknowledgmentStatus: ackStatus,
        message: { heading: {}, detail: [] },
      }
      const result = transformPurchaseOrder(raw)
      expect(result.status).toBe(expected)
    })
  }
})

describe('transformPurchaseOrder — orderful businessNumber fallback', () => {
  const raw: RawOrderfulTransaction = {
    id: 999,
    businessNumber: 'BN-FALLBACK',
    sender: { liveIsaId: 'ISA-999' },
    deliveryStatus: 'PENDING',
    message: { heading: {}, detail: [] },
  }
  const result = transformPurchaseOrder(raw)

  it('falls back to businessNumber for number when PO number absent', () => {
    expect(result.number).toBe('BN-FALLBACK')
  })

  it('falls back to liveIsaId for supplierId when ediAccountId absent', () => {
    expect(result.supplierId).toBe('ISA-999')
  })

  it('passes schema validation', () => {
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
