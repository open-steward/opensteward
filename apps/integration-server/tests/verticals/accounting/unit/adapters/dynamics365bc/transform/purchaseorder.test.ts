import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type BCPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/dynamics365bc/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<BCPurchaseOrder> = {}): BCPurchaseOrder {
  return {
    id: 'po-1',
    number: 'PO-001',
    vendorId: 'vendor-1',
    vendorName: 'Supplier Co',
    totalAmountIncludingTax: 5000,
    totalTaxAmount: 500,
    currencyCode: 'GBP',
    status: 'Open',
    orderDate: '2024-05-01',
    ...overrides,
  }
}

describe('transformPurchaseOrder (dynamics365bc)', () => {
  it('maps id and contactId', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.id).toBe('po-1')
    expect(result.contactId).toBe('vendor-1')
  })

  it('Draft → DRAFT', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'Draft' })).status).toBe('DRAFT')
  })

  it('Open → ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'Open' })).status).toBe('ACTIVE')
  })

  it('Received → COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'Received' })).status).toBe('COMPLETED')
  })

  it('maps totalAmount and currency', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.totalAmount).toBe(5000)
    expect(result.currency).toBe('GBP')
  })

  it('maps postedAt from orderDate', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).postedAt).toEqual(new Date('2024-05-01'))
  })

  it('passes raw object as metadata', () => {
    const raw = makePurchaseOrder()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
