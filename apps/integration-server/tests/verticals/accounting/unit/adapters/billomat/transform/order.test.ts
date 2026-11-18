import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import {
  transformOrder,
  type BillomatOrder,
} from '../../../../../../../src/verticals/accounting/adapters/billomat/transform/order'

function makeOrder(overrides: Partial<BillomatOrder> = {}): BillomatOrder {
  return {
    id: 'bm-ord-1',
    order_number: 'ORD-001',
    client_id: 'client-10',
    currency_code: 'EUR',
    date: '2024-01-15',
    status: 'OPEN',
    total_gross: 5000,
    total_net: 4200,
    tax_amount: 800,
    order_items: [],
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps id to id', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('bm-ord-1')
  })

  it('maps client_id to contactId', () => {
    const result = transformOrder(makeOrder())
    expect(result.contactId).toBe('client-10')
  })

  it('maps currency_code to currency', () => {
    const result = transformOrder(makeOrder())
    expect(result.currency).toBe('EUR')
  })

  it('maps total_gross to totalAmount', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalAmount).toBe(5000)
  })

  it('sets type to SALES', () => {
    const result = transformOrder(makeOrder())
    expect(result.type).toBe('SALES')
  })

  it('parses date as Date', () => {
    const result = transformOrder(makeOrder())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps OPEN status to ACTIVE', () => {
    const result = transformOrder(makeOrder({ status: 'OPEN' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps DRAFT status to DRAFT', () => {
    const result = transformOrder(makeOrder({ status: 'DRAFT' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps COMPLETED status to COMPLETED', () => {
    const result = transformOrder(makeOrder({ status: 'COMPLETED' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps INVOICED status to COMPLETED', () => {
    const result = transformOrder(makeOrder({ status: 'INVOICED' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps CANCELLED status to CANCELLED', () => {
    const result = transformOrder(makeOrder({ status: 'CANCELLED' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps CANCELED status to CANCELLED', () => {
    const result = transformOrder(makeOrder({ status: 'CANCELED' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps order_items to lineItems', () => {
    const raw = makeOrder({
      order_items: [
        {
          id: 'li-1',
          article_id: 'art-5',
          description: 'Widget',
          quantity: 2,
          unit_price: 100,
          total_gross: 200,
          tax_rate: 19,
          tax_amount: 38,
          account_id: 'acc-1',
          discount: 0,
        },
      ],
    })
    const result = transformOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('li-1')
    expect(li.itemId).toBe('art-5')
    expect(li.itemDescription).toBe('Widget')
    expect(li.unitAmount).toBe(100)
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(200)
    expect(li.taxAmount).toBe(38)
    expect(li.accountId).toBe('acc-1')
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
