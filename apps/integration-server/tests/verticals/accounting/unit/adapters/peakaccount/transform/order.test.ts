import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type PeakAccountOrder } from '../../../../../../../src/verticals/accounting/adapters/peakaccount/transform/order'

function makeOrder(overrides: Partial<PeakAccountOrder> = {}): PeakAccountOrder {
  return {
    id: 'ORD-001',
    documentNo: 'ORD-2024-001',
    status: 'pending',
    issueDate: '2024-01-05',
    totalAmount: 21400,
    currency: 'THB',
    contactId: 'CUST-001',
    items: [],
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps core fields correctly', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('ORD-001')
    expect(result.contactId).toBe('CUST-001')
    expect(result.totalAmount).toBe(21400)
    expect(result.currency).toBe('THB')
    expect(result.type).toBe('SALES')
  })

  it('parses date as Date object', () => {
    const result = transformOrder(makeOrder())
    expect(result.postedAt).toEqual(new Date('2024-01-05'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps pending status to ACTIVE', () => {
    expect(transformOrder(makeOrder({ status: 'pending' })).status).toBe('ACTIVE')
  })

  it('maps approved status to COMPLETED', () => {
    expect(transformOrder(makeOrder({ status: 'approved' })).status).toBe('COMPLETED')
  })

  it('maps cancelled status to CANCELLED', () => {
    expect(transformOrder(makeOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps draft status to DRAFT', () => {
    expect(transformOrder(makeOrder({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
