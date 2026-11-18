import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type EpsilonNetOrder } from '../../../../../../../src/verticals/accounting/adapters/epsilonnet/transform/order'

function makeOrder(overrides: Partial<EpsilonNetOrder> = {}): EpsilonNetOrder {
  return {
    id: '6001',
    orderNumber: 'ORD-2024-001',
    status: 'Draft',
    issueDate: '2024-03-01',
    totalGrossValue: 620,
    totalVatAmount: 120,
    currency: 'EUR',
    counterpart: { vatNumber: 'EL111000111' },
    lines: [],
    ...overrides,
  }
}

describe('transformOrder (EpsilonNet)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('6001')
    expect(result.contactId).toBe('EL111000111')
    expect(result.totalAmount).toBe(620)
    expect(result.currency).toBe('EUR')
  })

  it('parses date as Date object', () => {
    const result = transformOrder(makeOrder())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
  })

  it('maps Draft to DRAFT', () => {
    const result = transformOrder(makeOrder({ status: 'Draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps Submitted to ACTIVE', () => {
    const result = transformOrder(makeOrder({ status: 'Submitted' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps Completed to COMPLETED', () => {
    const result = transformOrder(makeOrder({ status: 'Completed' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps Cancelled to CANCELLED', () => {
    const result = transformOrder(makeOrder({ status: 'Cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
