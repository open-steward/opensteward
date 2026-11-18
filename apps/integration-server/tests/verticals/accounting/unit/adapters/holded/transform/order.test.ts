import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type HoldedOrder } from '../../../../../../../src/verticals/accounting/adapters/holded/transform/order'

function makeOrder(overrides: Partial<HoldedOrder> = {}): HoldedOrder {
  return {
    id: 'holded-order-1',
    orderNum: '2024001',
    contact: 'contact-5',
    currency: 'EUR',
    subtotal: 800,
    tax: 200,
    total: 1000,
    items: [],
    date: 1705276800, // 2024-01-15 in Unix seconds
    status: 1,
    ...overrides,
  }
}

describe('transformOrder (holded)', () => {
  it('maps id', () => {
    expect(transformOrder(makeOrder()).id).toBe('holded-order-1')
  })

  it('maps contact to contactId', () => {
    expect(transformOrder(makeOrder()).contactId).toBe('contact-5')
  })

  it('maps total to totalAmount', () => {
    expect(transformOrder(makeOrder()).totalAmount).toBe(1000)
  })

  it('maps currency', () => {
    expect(transformOrder(makeOrder()).currency).toBe('EUR')
  })

  it('sets type to SALES', () => {
    expect(transformOrder(makeOrder()).type).toBe('SALES')
  })

  it('converts unix timestamp to Date for postedAt', () => {
    expect(transformOrder(makeOrder()).postedAt).toEqual(new Date(1705276800 * 1000))
  })

  it('maps status 3 to CANCELLED', () => {
    expect(transformOrder(makeOrder({ status: 3 })).status).toBe('CANCELLED')
  })

  it('maps status 2 to COMPLETED', () => {
    expect(transformOrder(makeOrder({ status: 2 })).status).toBe('COMPLETED')
  })

  it('maps status 1 to ACTIVE', () => {
    expect(transformOrder(makeOrder({ status: 1 })).status).toBe('ACTIVE')
  })

  it('maps status 0 to DRAFT', () => {
    expect(transformOrder(makeOrder({ status: 0 })).status).toBe('DRAFT')
  })

  it('maps items to lineItems', () => {
    const raw = makeOrder({
      items: [
        {
          id: 'item-1',
          name: 'Gadget',
          description: 'A gadget',
          units: 4,
          subtotal: 400,
          total: 480,
          tax: 80,
          accountId: 'acc-sales',
        },
      ],
    })
    const result = transformOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('item-1')
    expect(li.itemName).toBe('Gadget')
    expect(li.itemDescription).toBe('A gadget')
    expect(li.unitQuantity).toBe(4)
    expect(li.totalAmount).toBe(480)
    expect(li.taxAmount).toBe(80)
    expect(li.accountId).toBe('acc-sales')
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
