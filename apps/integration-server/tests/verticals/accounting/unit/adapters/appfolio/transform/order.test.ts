import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type AppFolioOrder } from '../../../../../../../src/verticals/accounting/adapters/appfolio/transform/order'

function makeOrder(overrides: Partial<AppFolioOrder> = {}): AppFolioOrder {
  return {
    id: '601',
    order_number: 'ORD-2024-001',
    vendor_id: '55',
    property_id: 'prop_1',
    date: '2024-04-01',
    amount: 1800,
    currency: 'USD',
    status: 'active',
    line_items: [],
    ...overrides,
  }
}

describe('transformOrder (AppFolio)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('601')
    expect(result.contactId).toBe('55')
    expect(result.totalAmount).toBe(1800)
    expect(result.currency).toBe('USD')
  })

  it('parses ISO date as Date object', () => {
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
          description: 'Landscaping',
          quantity: 1,
          unit_price: 1800,
          amount: 1800,
          account_id: '5001',
        },
      ],
    })
    const result = transformOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].accountId).toBe('5001')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
