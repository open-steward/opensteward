import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type LessAccountingOrder } from '../../../../../../../src/verticals/accounting/adapters/lessaccounting/transform/order'

function makeOrder(overrides: Partial<LessAccountingOrder> = {}): LessAccountingOrder {
  return {
    id: 'la-order-1',
    order_number: 'ORD-001',
    contact_id: 'contact-3',
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

describe('transformOrder (lessaccounting)', () => {
  it('maps id', () => {
    expect(transformOrder(makeOrder()).id).toBe('la-order-1')
  })

  it('maps contact_id to contactId', () => {
    expect(transformOrder(makeOrder()).contactId).toBe('contact-3')
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

  it('maps status fulfilled to COMPLETED', () => {
    expect(transformOrder(makeOrder({ status: 'fulfilled' })).status).toBe('COMPLETED')
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
          id: 'item-1',
          name: 'Product',
          description: 'A product',
          quantity: 2,
          unit_price: 100,
          total: 200,
          tax: 20,
          account_id: 'acc-a',
        },
      ],
    })
    const result = transformOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('item-1')
    expect(li.itemName).toBe('Product')
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(200)
    expect(li.taxAmount).toBe(20)
    expect(li.accountId).toBe('acc-a')
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
