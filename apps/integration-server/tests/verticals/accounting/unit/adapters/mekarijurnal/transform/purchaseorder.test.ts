import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type MekariJurnalPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/mekarijurnal/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<MekariJurnalPurchaseOrder> = {}): MekariJurnalPurchaseOrder {
  return {
    id: 501,
    date: '2024-10-01',
    status: 'open',
    person_id: 70,
    total: 600000,
    currency_code: 'IDR',
    lines: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder (mekarijurnal)', () => {
  it('maps core fields correctly', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.id).toBe('501')
    expect(result.contactId).toBe('70')
    expect(result.totalAmount).toBe(600000)
    expect(result.currency).toBe('IDR')
  })

  it('parses date as Date object', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.postedAt).toEqual(new Date('2024-10-01'))
  })

  it('maps open to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'open' })).status).toBe('ACTIVE')
  })

  it('maps paid/closed to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'paid' })).status).toBe('COMPLETED')
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'closed' })).status).toBe('COMPLETED')
  })

  it('maps cancelled to CANCELLED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
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
