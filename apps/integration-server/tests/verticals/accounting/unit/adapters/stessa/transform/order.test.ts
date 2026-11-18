import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type StessaOrder } from '../../../../../../../src/verticals/accounting/adapters/stessa/transform/order'

function makeOrder(overrides: Partial<StessaOrder> = {}): StessaOrder {
  return {
    id: 'stessa-order-1',
    orderNumber: 'ORD-001',
    contactId: 'contact-6',
    currency: 'USD',
    total: 1500,
    taxAmount: 300,
    date: '2024-01-15',
    status: 'active',
    items: [],
    ...overrides,
  }
}

describe('transformOrder (stessa)', () => {
  it('maps id', () => {
    expect(transformOrder(makeOrder()).id).toBe('stessa-order-1')
  })

  it('maps contactId to contactId', () => {
    expect(transformOrder(makeOrder()).contactId).toBe('contact-6')
  })

  it('maps total to totalAmount', () => {
    expect(transformOrder(makeOrder()).totalAmount).toBe(1500)
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
          unitPrice: 100,
          total: 300,
          taxAmount: 60,
          accountId: 'acc-rev',
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
    expect(li.taxAmount).toBe(60)
    expect(li.accountId).toBe('acc-rev')
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
