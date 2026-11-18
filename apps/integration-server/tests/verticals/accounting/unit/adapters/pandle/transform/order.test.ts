import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type PandleOrder } from '../../../../../../../src/verticals/accounting/adapters/pandle/transform/order'

function makeOrder(overrides: Partial<PandleOrder> = {}): PandleOrder {
  return {
    id: 101,
    order_number: 'ORD-101',
    customer_id: 55,
    currency: 'GBP',
    issue_date: '2024-01-15',
    status: 'active',
    net_amount: 800,
    tax_amount: 160,
    total_amount: 960,
    reference: 'REF-001',
    notes: '',
    order_lines: [],
    ...overrides,
  }
}

describe('transformOrder (pandle)', () => {
  it('maps id', () => {
    expect(transformOrder(makeOrder()).id).toBe('101')
  })

  it('maps customer_id to contactId', () => {
    expect(transformOrder(makeOrder()).contactId).toBe('55')
  })

  it('maps total_amount to totalAmount', () => {
    expect(transformOrder(makeOrder()).totalAmount).toBe(960)
  })

  it('maps currency', () => {
    expect(transformOrder(makeOrder()).currency).toBe('GBP')
  })

  it('sets type to SALES', () => {
    expect(transformOrder(makeOrder()).type).toBe('SALES')
  })

  it('maps issue_date to postedAt as Date', () => {
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

  it('maps order_lines to lineItems', () => {
    const raw = makeOrder({
      order_lines: [
        {
          id: 201,
          account_id: 3000,
          description: 'Widget',
          quantity: 2,
          unit_price: 100,
          net_amount: 200,
          tax_rate_id: 5,
          tax_amount: 40,
          total_amount: 240,
        },
      ],
    })
    const result = transformOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('201')
    expect(li.accountId).toBe('3000')
    expect(li.itemDescription).toBe('Widget')
    expect(li.unitAmount).toBe(100)
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(240)
    expect(li.taxAmount).toBe(40)
    expect(li.taxrateId).toBe('5')
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
