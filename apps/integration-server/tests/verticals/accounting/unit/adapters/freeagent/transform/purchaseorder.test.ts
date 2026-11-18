import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import {
  transformPurchaseOrder,
  type FreeAgentPurchaseOrder,
} from '../../../../../../../src/verticals/accounting/adapters/freeagent/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<FreeAgentPurchaseOrder> = {}): FreeAgentPurchaseOrder {
  return {
    url: 'https://api.freeagent.com/v2/purchase_orders/44',
    contact: 'https://api.freeagent.com/v2/contacts/15',
    reference: 'PO-2024-001',
    dated_on: '2024-08-01',
    currency: 'GBP',
    total_value: '3000.00',
    status: 'Sent',
    ...overrides,
  }
}

describe('transformPurchaseOrder', () => {
  it('extracts id from url', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).id).toBe('44')
  })

  it('extracts contactId from contact url', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).contactId).toBe('15')
  })

  it('maps currency correctly', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).currency).toBe('GBP')
  })

  it('parses totalAmount from total_value', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).totalAmount).toBe(3000)
  })

  it('parses dated_on as postedAt Date', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).postedAt).toEqual(new Date('2024-08-01'))
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Sent status to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'Sent' })).status).toBe('ACTIVE')
  })

  it('maps Received status to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'Received' })).status).toBe('COMPLETED')
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
