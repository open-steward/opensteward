import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type FinlyOrder } from '../../../../../../../src/verticals/accounting/adapters/finly/transform/order'

function makeOrder(overrides: Partial<FinlyOrder> = {}): FinlyOrder {
  return {
    id: 'order-1',
    order_number: 'ORD-001',
    customer_id: 'cust-42',
    currency: 'USD',
    subtotal: 800,
    tax_amount: 200,
    total_amount: 1000,
    items: [],
    date: '2024-01-15',
    status: 'active',
    ...overrides,
  }
}

describe('transformOrder (finly)', () => {
  it('maps id', () => {
    expect(transformOrder(makeOrder()).id).toBe('order-1')
  })

  it('maps customer_id to contactId', () => {
    expect(transformOrder(makeOrder()).contactId).toBe('cust-42')
  })

  it('maps total_amount to totalAmount', () => {
    expect(transformOrder(makeOrder()).totalAmount).toBe(1000)
  })

  it('maps currency', () => {
    expect(transformOrder(makeOrder()).currency).toBe('USD')
  })

  it('sets type to SALES', () => {
    expect(transformOrder(makeOrder()).type).toBe('SALES')
  })

  it('maps date to postedAt as Date', () => {
    expect(transformOrder(makeOrder()).postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps status completed to COMPLETED', () => {
    expect(transformOrder(makeOrder({ status: 'completed' })).status).toBe('COMPLETED')
  })

  it('maps status invoiced to COMPLETED', () => {
    expect(transformOrder(makeOrder({ status: 'invoiced' })).status).toBe('COMPLETED')
  })

  it('maps status cancelled to CANCELLED', () => {
    expect(transformOrder(makeOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps status void to CANCELLED', () => {
    expect(transformOrder(makeOrder({ status: 'void' })).status).toBe('CANCELLED')
  })

  it('maps status draft to DRAFT', () => {
    expect(transformOrder(makeOrder({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps unknown status to ACTIVE', () => {
    expect(transformOrder(makeOrder({ status: 'pending' })).status).toBe('ACTIVE')
  })

  it('maps items to lineItems', () => {
    const raw = makeOrder({
      items: [
        {
          id: 'li-1',
          name: 'Widget',
          description: 'A widget',
          quantity: 2,
          unit_price: 100,
          total: 200,
          tax: 40,
          account_id: 'acc-10',
        },
      ],
    })
    const result = transformOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('li-1')
    expect(li.itemName).toBe('Widget')
    expect(li.itemDescription).toBe('A widget')
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(200)
    expect(li.taxAmount).toBe(40)
    expect(li.accountId).toBe('acc-10')
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
