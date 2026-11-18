import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type AppFolioPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/appfolio/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<AppFolioPurchaseOrder> = {}): AppFolioPurchaseOrder {
  return {
    id: '451',
    order_number: 'PO-2024-001',
    vendor_id: '55',
    property_id: 'prop_1',
    date: '2024-04-15',
    amount: 4500,
    currency: 'USD',
    status: 'active',
    line_items: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder (AppFolio)', () => {
  it('maps core fields correctly', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.id).toBe('451')
    expect(result.contactId).toBe('55')
    expect(result.totalAmount).toBe(4500)
    expect(result.currency).toBe('USD')
  })

  it('parses ISO date as Date object', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.postedAt).toEqual(new Date('2024-04-15'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makePurchaseOrder()
    const result = transformPurchaseOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps active status to ACTIVE', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ status: 'active' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps completed status to COMPLETED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ status: 'completed' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps cancelled status to CANCELLED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ status: 'cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps unknown status to DRAFT', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ status: 'pending' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps line items to lineItems', () => {
    const raw = makePurchaseOrder({
      line_items: [
        {
          id: 21,
          description: 'Roof repair',
          quantity: 1,
          unit_price: 4500,
          amount: 4500,
          account_id: '5002',
        },
      ],
    })
    const result = transformPurchaseOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('21')
    expect(result.lineItems![0].accountId).toBe('5002')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
