import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type ClearBooksPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/clearbooks/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<ClearBooksPurchaseOrder> = {}): ClearBooksPurchaseOrder {
  return {
    purchase_order_id: '451',
    order_number: 'PO-2024-001',
    entity_id: '55',
    date_created: '15/04/2024',
    total_gross: 360,
    total_tax: 60,
    currency: 'GBP',
    status: 'active',
    line_items: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder (ClearBooks)', () => {
  it('maps core fields correctly', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.id).toBe('451')
    expect(result.contactId).toBe('55')
    expect(result.totalAmount).toBe(360)
    expect(result.currency).toBe('GBP')
  })

  it('parses UK date format DD/MM/YYYY', () => {
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

  it('maps delivered status to COMPLETED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ status: 'delivered' }))
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
          description: 'Raw materials',
          quantity: 100,
          unit_price: 3,
          total_net: 300,
          tax_amount: 60,
          account_code: '5000',
        },
      ],
    })
    const result = transformPurchaseOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('21')
    expect(result.lineItems![0].unitQuantity).toBe(100)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
