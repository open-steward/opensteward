import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type ClearBooksOrder } from '../../../../../../../src/verticals/accounting/adapters/clearbooks/transform/order'

function makeOrder(overrides: Partial<ClearBooksOrder> = {}): ClearBooksOrder {
  return {
    order_id: '601',
    order_number: 'ORD-2024-001',
    entity_id: '42',
    date_created: '01/04/2024',
    total_gross: 600,
    total_tax: 100,
    currency: 'GBP',
    status: 'active',
    line_items: [],
    ...overrides,
  }
}

describe('transformOrder (ClearBooks)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('601')
    expect(result.contactId).toBe('42')
    expect(result.totalAmount).toBe(600)
    expect(result.currency).toBe('GBP')
  })

  it('parses UK date format DD/MM/YYYY', () => {
    const result = transformOrder(makeOrder())
    expect(result.postedAt).toEqual(new Date('2024-04-01'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps active status to ACTIVE', () => {
    const result = transformOrder(makeOrder({ status: 'active' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps completed status to COMPLETED', () => {
    const result = transformOrder(makeOrder({ status: 'completed' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps cancelled status to CANCELLED', () => {
    const result = transformOrder(makeOrder({ status: 'cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps unknown status to DRAFT', () => {
    const result = transformOrder(makeOrder({ status: 'pending' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps line items to lineItems', () => {
    const raw = makeOrder({
      line_items: [
        {
          id: 1,
          description: 'Product A',
          quantity: 3,
          unit_price: 200,
          total_net: 600,
          tax_amount: 120,
          account_code: '4001',
        },
      ],
    })
    const result = transformOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].unitQuantity).toBe(3)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
