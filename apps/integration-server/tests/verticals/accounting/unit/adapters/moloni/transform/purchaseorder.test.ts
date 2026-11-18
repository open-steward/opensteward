import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type MoloniPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/moloni/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<MoloniPurchaseOrder> = {}): MoloniPurchaseOrder {
  return {
    document_id: 600,
    date: '2024-08-01',
    supplier_id: 70,
    net_value: 1200,
    currency_code: 'EUR',
    status: 1,
    ...overrides,
  }
}

describe('transformPurchaseOrder', () => {
  it('maps core fields correctly', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.id).toBe('600')
    expect(result.contactId).toBe('70')
    expect(result.totalAmount).toBe(1200)
    expect(result.currency).toBe('EUR')
  })

  it('parses date as Date object', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.postedAt).toEqual(new Date('2024-08-01'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makePurchaseOrder({ net_value: 500 })
    const result = transformPurchaseOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps supplier_id 0 to undefined contactId', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ supplier_id: 0 }))
    expect(result.contactId).toBeUndefined()
  })

  it('returns undefined postedAt when date is empty', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ date: '' }))
    expect(result.postedAt).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
