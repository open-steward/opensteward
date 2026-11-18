import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type PatriotOrder } from '../../../../../../../src/verticals/accounting/adapters/patriot/transform/order'

function makeOrder(overrides: Partial<PatriotOrder> = {}): PatriotOrder {
  return {
    id: 'pat-order-1',
    number: 'ORD-001',
    contact_id: 'contact-7',
    currency: 'USD',
    date: '2024-01-15',
    status: 'active',
    total_amount: 1000,
    tax_amount: 200,
    lines: [],
    ...overrides,
  }
}

describe('transformOrder (patriot)', () => {
  it('maps id', () => {
    expect(transformOrder(makeOrder()).id).toBe('pat-order-1')
  })

  it('maps contact_id to contactId', () => {
    expect(transformOrder(makeOrder()).contactId).toBe('contact-7')
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

  it('maps status voided to CANCELLED', () => {
    expect(transformOrder(makeOrder({ status: 'voided' })).status).toBe('CANCELLED')
  })

  it('maps status draft to DRAFT', () => {
    expect(transformOrder(makeOrder({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps unknown status to ACTIVE', () => {
    expect(transformOrder(makeOrder({ status: 'open' })).status).toBe('ACTIVE')
  })

  it('maps lines to lineItems', () => {
    const raw = makeOrder({
      lines: [
        {
          id: 'line-1',
          description: 'Service',
          quantity: 2,
          rate: 200,
          amount: 400,
          tax_amount: 40,
          account_id: 'acc-revenue',
        },
      ],
    })
    const result = transformOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('line-1')
    expect(li.itemDescription).toBe('Service')
    expect(li.unitAmount).toBe(200)
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(400)
    expect(li.taxAmount).toBe(40)
    expect(li.accountId).toBe('acc-revenue')
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
