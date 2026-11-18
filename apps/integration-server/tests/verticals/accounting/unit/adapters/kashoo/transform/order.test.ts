import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type KashooOrder } from '../../../../../../../src/verticals/accounting/adapters/kashoo/transform/order'

function makeOrder(overrides: Partial<KashooOrder> = {}): KashooOrder {
  return {
    id: 'kash-order-1',
    order_number: 'ORD-001',
    contact_id: 'contact-10',
    currency: 'CAD',
    subtotal: 800,
    tax_amount: 200,
    total: 1000,
    items: [],
    date: '2024-01-15',
    status: 'active',
    ...overrides,
  }
}

describe('transformOrder (kashoo)', () => {
  it('maps id', () => {
    expect(transformOrder(makeOrder()).id).toBe('kash-order-1')
  })

  it('maps contact_id to contactId', () => {
    expect(transformOrder(makeOrder()).contactId).toBe('contact-10')
  })

  it('maps total to totalAmount', () => {
    expect(transformOrder(makeOrder()).totalAmount).toBe(1000)
  })

  it('maps currency', () => {
    expect(transformOrder(makeOrder()).currency).toBe('CAD')
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
    expect(transformOrder(makeOrder({ status: 'open' })).status).toBe('ACTIVE')
  })

  it('maps items to lineItems', () => {
    const raw = makeOrder({
      items: [
        {
          id: 'item-1',
          name: 'Widget',
          description: 'A widget',
          quantity: 3,
          unit_price: 100,
          total: 300,
          tax_amount: 30,
          account_id: 'acc-1',
        },
      ],
    })
    const result = transformOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('item-1')
    expect(li.itemName).toBe('Widget')
    expect(li.unitQuantity).toBe(3)
    expect(li.totalAmount).toBe(300)
    expect(li.taxAmount).toBe(30)
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
