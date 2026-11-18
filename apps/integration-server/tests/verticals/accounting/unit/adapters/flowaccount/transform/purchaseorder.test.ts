import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type FlowAccountPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/flowaccount/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<FlowAccountPurchaseOrder> = {}): FlowAccountPurchaseOrder {
  return {
    id: 1200,
    documentSerial: 'PO2024-00001',
    statusId: 2,
    issuedDate: '2024-01-12',
    dueDate: '2024-02-12',
    amountTotal: 25000,
    currencyCode: 'THB',
    contactCode: 'SUPP-003',
    items: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder', () => {
  it('maps core fields correctly', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.id).toBe('1200')
    expect(result.contactId).toBe('SUPP-003')
    expect(result.totalAmount).toBe(25000)
    expect(result.currency).toBe('THB')
  })

  it('parses date as Date object', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.postedAt).toEqual(new Date('2024-01-12'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makePurchaseOrder()
    const result = transformPurchaseOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps statusId 1 to DRAFT', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ statusId: 1 })).status).toBe('DRAFT')
  })

  it('maps statusId 2 to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ statusId: 2 })).status).toBe('ACTIVE')
  })

  it('maps statusId 3 to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ statusId: 3 })).status).toBe('COMPLETED')
  })

  it('maps statusId 4 to CANCELLED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ statusId: 4 })).status).toBe('CANCELLED')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
