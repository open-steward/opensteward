import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type AccuratePurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/accurate/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<AccuratePurchaseOrder> = {}): AccuratePurchaseOrder {
  return {
    id: 11001,
    number: 'POR/2024/001',
    status: 'Open',
    transactionDate: '2024-11-01',
    customerNo: 'V-011',
    totalAmount: 2200000,
    currencyCode: 'IDR',
    detailItem: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder (accurate)', () => {
  it('maps core fields correctly', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.id).toBe('11001')
    expect(result.contactId).toBe('V-011')
    expect(result.totalAmount).toBe(2200000)
    expect(result.currency).toBe('IDR')
  })

  it('parses date as Date object', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.postedAt).toEqual(new Date('2024-11-01'))
  })

  it('maps Open to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'Open' })).status).toBe('ACTIVE')
  })

  it('maps Closed to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'Closed' })).status).toBe('COMPLETED')
  })

  it('maps Cancelled to CANCELLED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'Cancelled' })).status).toBe('CANCELLED')
  })

  it('maps Voided to CANCELLED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'Voided' })).status).toBe('CANCELLED')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makePurchaseOrder()
    const result = transformPurchaseOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
