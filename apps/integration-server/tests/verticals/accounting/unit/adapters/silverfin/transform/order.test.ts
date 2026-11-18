import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type SilverfinOrder } from '../../../../../../../src/verticals/accounting/adapters/silverfin/transform/order'

function makeOrder(overrides: Partial<SilverfinOrder> = {}): SilverfinOrder {
  return {
    id: '5001',
    status: 'draft',
    order_number: 'ORD-2024-001',
    period: '2024-03-10',
    total_amount: 2000,
    currency: 'EUR',
    contact_id: '25',
    lines: [],
    ...overrides,
  }
}

describe('transformOrder (Silverfin)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('5001')
    expect(result.contactId).toBe('25')
    expect(result.totalAmount).toBe(2000)
    expect(result.currency).toBe('EUR')
  })

  it('parses period as postedAt Date', () => {
    const result = transformOrder(makeOrder())
    expect(result.postedAt).toEqual(new Date('2024-03-10'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps draft status to DRAFT', () => {
    const result = transformOrder(makeOrder({ status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps approved status to ACTIVE', () => {
    const result = transformOrder(makeOrder({ status: 'approved' }))
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

  it('returns empty lineItems array when lines is absent', () => {
    const result = transformOrder(makeOrder({ lines: [] }))
    expect(result.lineItems).toEqual([])
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
