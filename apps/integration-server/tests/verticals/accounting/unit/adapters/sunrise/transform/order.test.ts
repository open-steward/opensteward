import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type SunriseOrder } from '../../../../../../../src/verticals/accounting/adapters/sunrise/transform/order'

function makeOrder(overrides: Partial<SunriseOrder> = {}): SunriseOrder {
  return {
    id: 'sunrise-order-1',
    order_number: 'ORD-001',
    contact_id: 'contact-7',
    currency: 'CHF',
    total_amount: 1100,
    tax_amount: 77,
    date: '2024-01-15',
    status: 'active',
    line_items: [],
    ...overrides,
  }
}

describe('transformOrder (sunrise)', () => {
  it('maps id', () => {
    expect(transformOrder(makeOrder()).id).toBe('sunrise-order-1')
  })

  it('maps contact_id to contactId', () => {
    expect(transformOrder(makeOrder()).contactId).toBe('contact-7')
  })

  it('maps total_amount to totalAmount', () => {
    expect(transformOrder(makeOrder()).totalAmount).toBe(1100)
  })

  it('maps currency', () => {
    expect(transformOrder(makeOrder()).currency).toBe('CHF')
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

  it('maps line_items to lineItems', () => {
    const raw = makeOrder({
      line_items: [
        {
          id: 'li-1',
          name: 'Service',
          description: 'Tech service',
          quantity: 2,
          unit_price: 200,
          amount: 400,
          tax_amount: 28,
          account_id: 'acc-3000',
        },
      ],
    })
    const result = transformOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('li-1')
    expect(li.itemName).toBe('Service')
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(400)
    expect(li.taxAmount).toBe(28)
    expect(li.accountId).toBe('acc-3000')
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
