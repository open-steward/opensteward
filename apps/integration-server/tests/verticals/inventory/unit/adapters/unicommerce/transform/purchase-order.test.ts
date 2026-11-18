import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawUnicommercePurchaseOrder,
  type RawUnicommercePurchaseOrderItem,
} from '../../../../../../../src/verticals/inventory/adapters/unicommerce/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

function makeItem(
  overrides: Partial<RawUnicommercePurchaseOrderItem> = {},
): RawUnicommercePurchaseOrderItem {
  return {
    id: 1,
    itemSKU: 'SKU-001',
    itemTypeName: 'Widget',
    quantity: 100,
    pendingQuantity: 30,
    rejectedQuantity: 5,
    unitPrice: 250,
    maxRetailPrice: 500,
    subtotal: 25000,
    total: 26250,
    taxPercentage: 5,
    tax: 1250,
    ...overrides,
  }
}

function makeRaw(
  overrides: Partial<RawUnicommercePurchaseOrder> = {},
): RawUnicommercePurchaseOrder {
  return {
    id: 99,
    code: 'PO-2024-001',
    type: 'STANDARD',
    statusCode: 'APPROVED',
    vendorCode: 'VENDOR-01',
    vendorId: 7,
    vendorName: 'Acme Supplies',
    fromParty: 'WAREHOUSE-01',
    created: '2024-03-01T00:00:00Z',
    expiryDate: '2024-06-01',
    deliveryDate: '2024-04-01T00:00:00Z',
    purchaseOrderItems: [makeItem()],
    purchaseOrderPriceSummary: {
      totalAmount: 26250,
      subTotalBeforeTaxesAndDiscount: 25000,
      discount: 0,
      taxOnSales: 1250,
      logisticCharges: 0,
    },
    customFieldValues: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder (unicommerce)', () => {
  it('maps id and externalId from code', () => {
    const result = transformPurchaseOrder(makeRaw({ code: 'PO-2024-001' }))
    expect(result.id).toBe('PO-2024-001')
    expect(result.externalId).toBe('PO-2024-001')
  })

  it('falls back id to stringified numeric id when code is absent', () => {
    const result = transformPurchaseOrder(makeRaw({ code: undefined, id: 99 }))
    expect(result.id).toBe('99')
  })

  it('maps number from code', () => {
    const result = transformPurchaseOrder(makeRaw({ code: 'PO-2024-001' }))
    expect(result.number).toBe('PO-2024-001')
  })

  it('maps supplierId from vendorCode (preferred over vendorName)', () => {
    const result = transformPurchaseOrder(makeRaw({ vendorCode: 'VENDOR-01', vendorName: 'Acme' }))
    expect(result.supplierId).toBe('VENDOR-01')
  })

  it('falls back supplierId to vendorName when vendorCode is absent', () => {
    const result = transformPurchaseOrder(
      makeRaw({ vendorCode: undefined, vendorName: 'Acme Supplies' }),
    )
    expect(result.supplierId).toBe('Acme Supplies')
  })

  describe('status mapping', () => {
    it.each([
      ['DRAFT', 'draft'],
      ['CREATED', 'draft'],
      ['APPROVED', 'sent'],
      ['ORDERED', 'sent'],
      ['PARTIALLY_RECEIVED', 'partially_received'],
      ['RECEIVED', 'received'],
      ['CLOSED', 'closed'],
      ['COMPLETED', 'closed'],
      ['CANCELLED', 'cancelled'],
      ['REJECTED', 'cancelled'],
      ['UNKNOWN_STATUS', 'draft'],
    ] as const)('maps statusCode %s → %s', (statusCode, expected) => {
      const result = transformPurchaseOrder(makeRaw({ statusCode }))
      expect(result.status).toBe(expected)
    })
  })

  it('maps subtotalAmount and totalAmount from purchaseOrderPriceSummary as-is (no conversion)', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.subtotalAmount).toBe(25000)
    expect(result.totalAmount).toBe(26250)
  })

  it('maps orderedAt from created ISO string', () => {
    const result = transformPurchaseOrder(makeRaw({ created: '2024-03-01T00:00:00Z' }))
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps expectedAt from deliveryDate', () => {
    const result = transformPurchaseOrder(makeRaw({ deliveryDate: '2024-04-01T00:00:00Z' }))
    expect(result.expectedAt).toBe('2024-04-01T00:00:00.000Z')
  })

  it('has no destinationLocationId (unicommerce does not provide it)', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.destinationLocationId).toBeUndefined()
  })

  describe('line items', () => {
    it('maps productId from itemSKU', () => {
      const result = transformPurchaseOrder(makeRaw())
      expect(result.lines[0]!.productId).toBe('SKU-001')
    })

    it('maps quantityOrdered from quantity', () => {
      const result = transformPurchaseOrder(makeRaw())
      expect(result.lines[0]!.quantityOrdered).toBe(100)
    })

    it('computes quantityReceived = quantity - pendingQuantity - rejectedQuantity', () => {
      // 100 - 30 - 5 = 65
      const result = transformPurchaseOrder(makeRaw())
      expect(result.lines[0]!.quantityReceived).toBe(65)
    })

    it('omits quantityReceived when pendingQuantity is absent', () => {
      const result = transformPurchaseOrder(
        makeRaw({
          purchaseOrderItems: [makeItem({ pendingQuantity: undefined })],
        }),
      )
      expect(result.lines[0]!.quantityReceived).toBeUndefined()
    })

    it('defaults rejectedQuantity to 0 when absent in quantityReceived calculation', () => {
      // 100 - 30 - 0 = 70
      const result = transformPurchaseOrder(
        makeRaw({
          purchaseOrderItems: [makeItem({ rejectedQuantity: undefined })],
        }),
      )
      expect(result.lines[0]!.quantityReceived).toBe(70)
    })

    it('maps unitCost from unitPrice', () => {
      const result = transformPurchaseOrder(makeRaw())
      expect(result.lines[0]!.unitCost).toBe(250)
    })

    it('maps lineTotal from total', () => {
      const result = transformPurchaseOrder(makeRaw())
      expect(result.lines[0]!.lineTotal).toBe(26250)
    })

    it('returns empty lines array when purchaseOrderItems is absent', () => {
      const result = transformPurchaseOrder(makeRaw({ purchaseOrderItems: undefined }))
      expect(result.lines).toEqual([])
    })
  })

  it('extracts currency from customFieldValues when fieldName is "currency"', () => {
    const result = transformPurchaseOrder(
      makeRaw({
        customFieldValues: [{ fieldName: 'currency', fieldValue: 'INR' }],
      }),
    )
    expect(result.currency).toBe('INR')
  })

  it('currency is undefined when no matching customField', () => {
    const result = transformPurchaseOrder(makeRaw({ customFieldValues: [] }))
    expect(result.currency).toBeUndefined()
  })

  it('platform is "unicommerce"', () => {
    expect(transformPurchaseOrder(makeRaw()).platform).toBe('unicommerce')
  })

  it('passes PurchaseOrderSchema validation', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
