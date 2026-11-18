import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import {
  transformPurchaseOrder,
  type TallyPurchaseOrder,
} from '../../../../../../../src/verticals/accounting/adapters/tallyprime/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<TallyPurchaseOrder> = {}): TallyPurchaseOrder {
  return {
    VOUCHERNUMBER: 'PO/2024/001',
    PARTYLEDGERNAME: 'Raw Material Supplier',
    DATE: '20240810',
    AMOUNT: '25000.00',
    NARRATION: 'Purchase order for raw materials',
    ORDERSTATUS: 'Open',
    ...overrides,
  }
}

describe('transformPurchaseOrder', () => {
  it('maps VOUCHERNUMBER to id', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).id).toBe('PO/2024/001')
  })

  it('maps PARTYLEDGERNAME to contactId', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).contactId).toBe('Raw Material Supplier')
  })

  it('parses AMOUNT to totalAmount', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).totalAmount).toBe(25000)
  })

  it('parses DATE as postedAt Date object', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).postedAt).toEqual(new Date('2024-08-10'))
  })

  it('maps ORDERSTATUS Open to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ ORDERSTATUS: 'Open' })).status).toBe('ACTIVE')
  })

  it('maps ORDERSTATUS Closed to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ ORDERSTATUS: 'Closed' })).status).toBe('COMPLETED')
  })

  it('maps absent ORDERSTATUS to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ ORDERSTATUS: undefined })).status).toBe('ACTIVE')
  })

  it('sets contactId to undefined when PARTYLEDGERNAME is empty', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ PARTYLEDGERNAME: '' })).contactId).toBeUndefined()
  })

  it('sets totalAmount to undefined when AMOUNT is not a number', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ AMOUNT: 'N/A' })).totalAmount).toBeUndefined()
  })

  it('sets postedAt to undefined when DATE is invalid', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ DATE: 'bad-date' })).postedAt).toBeUndefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makePurchaseOrder()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
