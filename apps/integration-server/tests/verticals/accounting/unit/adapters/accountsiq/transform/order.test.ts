import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type AccountsIQOrder } from '../../../../../../../src/verticals/accounting/adapters/accountsiq/transform/order'

function makeOrder(overrides: Partial<AccountsIQOrder> = {}): AccountsIQOrder {
  return {
    orderId: '7001',
    entityId: '10',
    status: 'Draft',
    orderNumber: 'ORD-2024-001',
    orderDate: '2024-03-10',
    totalAmount: 4000,
    currency: 'EUR',
    contactId: '35',
    lines: [],
    ...overrides,
  }
}

describe('transformOrder (AccountsIQ)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('7001')
    expect(result.contactId).toBe('35')
    expect(result.totalAmount).toBe(4000)
    expect(result.currency).toBe('EUR')
  })

  it('parses orderDate as postedAt Date', () => {
    const result = transformOrder(makeOrder())
    expect(result.postedAt).toEqual(new Date('2024-03-10'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps Draft status to DRAFT', () => {
    const result = transformOrder(makeOrder({ status: 'Draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps Posted status to ACTIVE', () => {
    const result = transformOrder(makeOrder({ status: 'Posted' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps Completed status to COMPLETED', () => {
    const result = transformOrder(makeOrder({ status: 'Completed' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps Cancelled status to CANCELLED', () => {
    const result = transformOrder(makeOrder({ status: 'Cancelled' }))
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
