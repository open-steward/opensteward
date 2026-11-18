import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import {
  transformOrder,
  type CenterOrder,
} from '../../../../../../../src/verticals/accounting/adapters/center/transform/order'

function makeOrder(overrides: Partial<CenterOrder> = {}): CenterOrder {
  return {
    id: 'ctr-ord-1',
    orderNumber: 'ORD-001',
    contactId: 'contact-20',
    currency: 'USD',
    subtotal: 4000,
    taxAmount: 400,
    total: 4400,
    items: [],
    date: '2024-01-15',
    status: 'active',
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps id to id', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('ctr-ord-1')
  })

  it('maps contactId to contactId', () => {
    const result = transformOrder(makeOrder())
    expect(result.contactId).toBe('contact-20')
  })

  it('maps currency to currency', () => {
    const result = transformOrder(makeOrder())
    expect(result.currency).toBe('USD')
  })

  it('maps total to totalAmount', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalAmount).toBe(4400)
  })

  it('sets type to SALES', () => {
    const result = transformOrder(makeOrder())
    expect(result.type).toBe('SALES')
  })

  it('parses date as Date', () => {
    const result = transformOrder(makeOrder())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps active status to ACTIVE', () => {
    const result = transformOrder(makeOrder({ status: 'active' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps draft status to DRAFT', () => {
    const result = transformOrder(makeOrder({ status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps completed status to COMPLETED', () => {
    const result = transformOrder(makeOrder({ status: 'completed' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps fulfilled status to COMPLETED', () => {
    const result = transformOrder(makeOrder({ status: 'fulfilled' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps cancelled status to CANCELLED', () => {
    const result = transformOrder(makeOrder({ status: 'cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps voided status to CANCELLED', () => {
    const result = transformOrder(makeOrder({ status: 'voided' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps items to lineItems', () => {
    const raw = makeOrder({
      items: [
        {
          id: 'item-1',
          name: 'Widget',
          description: 'A widget item',
          quantity: 6,
          unitPrice: 100,
          total: 600,
          taxAmount: 60,
          accountId: 'acc-5',
        },
      ],
    })
    const result = transformOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('item-1')
    expect(li.itemName).toBe('Widget')
    expect(li.itemDescription).toBe('A widget item')
    expect(li.unitAmount).toBe(100)
    expect(li.unitQuantity).toBe(6)
    expect(li.totalAmount).toBe(600)
    expect(li.taxAmount).toBe(60)
    expect(li.accountId).toBe('acc-5')
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
