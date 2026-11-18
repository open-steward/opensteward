import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import {
  transformOrder,
  type PennylaneQuote,
} from '../../../../../../../src/verticals/accounting/adapters/pennylane/transform/order'

function makeOrder(overrides: Partial<PennylaneQuote> = {}): PennylaneQuote {
  return {
    id: 'quote-1',
    quote_number: 'Q-2024-001',
    customer: { source_id: 'cust-1' },
    date: '2024-08-01',
    deadline: '2024-08-31',
    currency: 'EUR',
    amount: 3000,
    status: 'awaiting_acceptance',
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps id correctly', () => {
    expect(transformOrder(makeOrder()).id).toBe('quote-1')
  })

  it('maps customer source_id to contactId', () => {
    expect(transformOrder(makeOrder()).contactId).toBe('cust-1')
  })

  it('returns undefined contactId when customer is null', () => {
    expect(transformOrder(makeOrder({ customer: null })).contactId).toBeUndefined()
  })

  it('sets type to SALES', () => {
    expect(transformOrder(makeOrder()).type).toBe('SALES')
  })

  it('maps currency correctly', () => {
    expect(transformOrder(makeOrder()).currency).toBe('EUR')
  })

  it('maps amount to totalAmount', () => {
    expect(transformOrder(makeOrder()).totalAmount).toBe(3000)
  })

  it('parses date as Date object', () => {
    expect(transformOrder(makeOrder()).postedAt).toEqual(new Date('2024-08-01'))
  })

  it('maps status draft to ACTIVE', () => {
    expect(transformOrder(makeOrder({ status: 'draft' })).status).toBe('ACTIVE')
  })

  it('maps status awaiting_acceptance to ACTIVE', () => {
    expect(transformOrder(makeOrder({ status: 'awaiting_acceptance' })).status).toBe('ACTIVE')
  })

  it('maps status accepted to COMPLETED', () => {
    expect(transformOrder(makeOrder({ status: 'accepted' })).status).toBe('COMPLETED')
  })

  it('maps status rejected to CANCELLED', () => {
    expect(transformOrder(makeOrder({ status: 'rejected' })).status).toBe('CANCELLED')
  })

  it('maps status cancelled to CANCELLED', () => {
    expect(transformOrder(makeOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
