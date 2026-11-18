import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type SellsyOrder } from '../../../../../../../src/verticals/accounting/adapters/sellsy/transform/order'

function makeOrder(overrides: Partial<SellsyOrder> = {}): SellsyOrder {
  return {
    id: 'sellsy-order-1',
    number: 'ORD-001',
    contact_id: 'contact-9',
    currency: 'EUR',
    date: '2024-01-15',
    status: 'active',
    total_amount: 1200,
    tax_amount: 240,
    lines: [],
    ...overrides,
  }
}

describe('transformOrder (sellsy)', () => {
  it('maps id', () => {
    expect(transformOrder(makeOrder()).id).toBe('sellsy-order-1')
  })

  it('maps contact_id to contactId', () => {
    expect(transformOrder(makeOrder()).contactId).toBe('contact-9')
  })

  it('maps total_amount to totalAmount', () => {
    expect(transformOrder(makeOrder()).totalAmount).toBe(1200)
  })

  it('maps currency', () => {
    expect(transformOrder(makeOrder()).currency).toBe('EUR')
  })

  it('sets type to SALES', () => {
    expect(transformOrder(makeOrder()).type).toBe('SALES')
  })

  it('maps date to postedAt as Date', () => {
    expect(transformOrder(makeOrder()).postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps status invoiced to COMPLETED', () => {
    expect(transformOrder(makeOrder({ status: 'invoiced' })).status).toBe('COMPLETED')
  })

  it('maps status completed to COMPLETED', () => {
    expect(transformOrder(makeOrder({ status: 'completed' })).status).toBe('COMPLETED')
  })

  it('maps status cancelled to CANCELLED', () => {
    expect(transformOrder(makeOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
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
          product_id: 'prod-5',
          description: 'Widget',
          quantity: 3,
          unit_amount: 100,
          total_amount: 300,
          tax_amount: 60,
          account_id: 'acc-rev',
        },
      ],
    })
    const result = transformOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('line-1')
    expect(li.itemId).toBe('prod-5')
    expect(li.itemDescription).toBe('Widget')
    expect(li.unitAmount).toBe(100)
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
