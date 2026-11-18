import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type MaxioOrder } from '../../../../../../../src/verticals/accounting/adapters/maxio/transform/order'

function makeOrder(overrides: Partial<MaxioOrder> = {}): MaxioOrder {
  return {
    id: 500,
    state: 'active',
    created_at: '2024-03-10T00:00:00Z',
    currency: 'USD',
    total_amount_in_cents: 49900,
    customer_id: 42,
    line_items: [],
    ...overrides,
  }
}

describe('transformOrder (Maxio)', () => {
  it('maps id as string', () => {
    expect(transformOrder(makeOrder()).id).toBe('500')
  })

  it('maps contacts from customer_id as string', () => {
    expect(transformOrder(makeOrder()).contactId).toBe('42')
  })

  it('converts total_amount_in_cents to dollars', () => {
    expect(transformOrder(makeOrder({ total_amount_in_cents: 49900 })).totalAmount).toBe(499)
  })

  it('maps currency', () => {
    expect(transformOrder(makeOrder()).currency).toBe('USD')
  })

  it('parses created_at as Date', () => {
    expect(transformOrder(makeOrder()).postedAt).toEqual(new Date('2024-03-10T00:00:00Z'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('maps active state to ACTIVE', () => {
    expect(transformOrder(makeOrder({ state: 'active' })).status).toBe('ACTIVE')
  })

  it('maps completed state to COMPLETED', () => {
    expect(transformOrder(makeOrder({ state: 'completed' })).status).toBe('COMPLETED')
  })

  it('maps canceled state to CANCELLED', () => {
    expect(transformOrder(makeOrder({ state: 'canceled' })).status).toBe('CANCELLED')
  })

  it('maps unknown state to DRAFT', () => {
    expect(transformOrder(makeOrder({ state: 'pending' })).status).toBe('DRAFT')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
