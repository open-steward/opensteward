import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type BlacklineOrder } from '../../../../../../../src/verticals/accounting/adapters/blackline/transform/order'

function makeOrder(overrides: Partial<BlacklineOrder> = {}): BlacklineOrder {
  return {
    orderId: 'ord-001',
    orderNumber: 'ORD-2024-001',
    status: 'Draft',
    accountId: 'acc-123',
    currency: 'USD',
    totalAmount: 2000,
    orderDate: '2024-03-01',
    createdBy: 'user-1',
    createdAt: '2024-03-01T10:00:00Z',
    modifiedBy: 'user-1',
    modifiedAt: '2024-03-01T10:00:00Z',
    lines: [],
    ...overrides,
  }
}

describe('transformOrder (BlackLine)', () => {
  it('maps id from orderId', () => {
    expect(transformOrder(makeOrder()).id).toBe('ord-001')
  })

  it('maps core fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.contactId).toBe('acc-123')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(2000)
  })

  it('parses orderDate as Date object', () => {
    expect(transformOrder(makeOrder()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformOrder(makeOrder({ status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Approved status to ACTIVE', () => {
    expect(transformOrder(makeOrder({ status: 'Approved' })).status).toBe('ACTIVE')
  })

  it('maps Closed status to COMPLETED', () => {
    expect(transformOrder(makeOrder({ status: 'Closed' })).status).toBe('COMPLETED')
  })

  it('maps Cancelled status to CANCELLED', () => {
    expect(transformOrder(makeOrder({ status: 'Cancelled' })).status).toBe('CANCELLED')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
