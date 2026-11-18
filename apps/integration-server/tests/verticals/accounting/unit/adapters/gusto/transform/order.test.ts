import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type GustoOrder } from '../../../../../../../src/verticals/accounting/adapters/gusto/transform/order'

function makeOrder(overrides: Partial<GustoOrder> = {}): GustoOrder {
  return {
    id: 'ord_001',
    status: 'draft',
    date: '2024-03-01',
    company_id: 'co_001',
    total_amount: 1200,
    currency: 'USD',
    lines: [],
    ...overrides,
  }
}

describe('transformOrder (Gusto)', () => {
  it('maps id to string', () => {
    expect(transformOrder(makeOrder({ id: 'ord_001' })).id).toBe('ord_001')
  })

  it('maps numeric id to string', () => {
    expect(transformOrder(makeOrder({ id: 8 })).id).toBe('8')
  })

  it('maps total_amount', () => {
    expect(transformOrder(makeOrder({ total_amount: 2000 })).totalAmount).toBe(2000)
  })

  it('maps company_id to contactId', () => {
    expect(transformOrder(makeOrder({ company_id: 'co_99' })).contactId).toBe('co_99')
  })

  it('maps currency', () => {
    expect(transformOrder(makeOrder({ currency: 'EUR' })).currency).toBe('EUR')
  })

  it('maps draft status to DRAFT', () => {
    expect(transformOrder(makeOrder({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps active status to ACTIVE', () => {
    expect(transformOrder(makeOrder({ status: 'active' })).status).toBe('ACTIVE')
  })

  it('maps completed status to COMPLETED', () => {
    expect(transformOrder(makeOrder({ status: 'completed' })).status).toBe('COMPLETED')
  })

  it('maps cancelled status to CANCELLED', () => {
    expect(transformOrder(makeOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps unknown status to DRAFT', () => {
    expect(transformOrder(makeOrder({ status: 'unknown' })).status).toBe('DRAFT')
  })

  it('parses date as Date', () => {
    expect(transformOrder(makeOrder({ date: '2024-03-01' })).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('passes raw object as metadata by reference', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeOrder({ id: 'ord_001' }))
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
