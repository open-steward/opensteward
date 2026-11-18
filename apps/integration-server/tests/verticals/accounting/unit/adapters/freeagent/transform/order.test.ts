import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import {
  transformOrder,
  type FreeAgentOrder,
} from '../../../../../../../src/verticals/accounting/adapters/freeagent/transform/order'

function makeOrder(overrides: Partial<FreeAgentOrder> = {}): FreeAgentOrder {
  return {
    url: 'https://api.freeagent.com/v2/estimates/33',
    contact: 'https://api.freeagent.com/v2/contacts/20',
    estimate_number: 'EST-2024-001',
    reference: 'PROJECT-A',
    dated_on: '2024-07-01',
    currency: 'GBP',
    total_value: '2500.00',
    status: 'Sent',
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('extracts id from url', () => {
    expect(transformOrder(makeOrder()).id).toBe('33')
  })

  it('extracts contactId from contact url', () => {
    expect(transformOrder(makeOrder()).contactId).toBe('20')
  })

  it('sets type to SALES', () => {
    expect(transformOrder(makeOrder()).type).toBe('SALES')
  })

  it('maps currency correctly', () => {
    expect(transformOrder(makeOrder()).currency).toBe('GBP')
  })

  it('parses totalAmount from total_value', () => {
    expect(transformOrder(makeOrder()).totalAmount).toBe(2500)
  })

  it('parses dated_on as postedAt Date', () => {
    expect(transformOrder(makeOrder()).postedAt).toEqual(new Date('2024-07-01'))
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformOrder(makeOrder({ status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Sent status to ACTIVE', () => {
    expect(transformOrder(makeOrder({ status: 'Sent' })).status).toBe('ACTIVE')
  })

  it('maps Approved status to COMPLETED', () => {
    expect(transformOrder(makeOrder({ status: 'Approved' })).status).toBe('COMPLETED')
  })

  it('maps Rejected status to CANCELLED', () => {
    expect(transformOrder(makeOrder({ status: 'Rejected' })).status).toBe('CANCELLED')
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
