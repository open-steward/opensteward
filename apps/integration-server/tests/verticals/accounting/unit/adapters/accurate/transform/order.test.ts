import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type AccurateOrder } from '../../../../../../../src/verticals/accounting/adapters/accurate/transform/order'

function makeOrder(overrides: Partial<AccurateOrder> = {}): AccurateOrder {
  return {
    id: 9001,
    number: 'SO/2024/001',
    status: 'Open',
    transactionDate: '2024-09-01',
    customerNo: 'C-009',
    totalAmount: 3300000,
    currencyCode: 'IDR',
    detailItem: [],
    ...overrides,
  }
}

describe('transformOrder (accurate)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('9001')
    expect(result.contactId).toBe('C-009')
    expect(result.totalAmount).toBe(3300000)
    expect(result.currency).toBe('IDR')
    expect(result.type).toBe('SALES')
  })

  it('parses date as Date object', () => {
    const result = transformOrder(makeOrder())
    expect(result.postedAt).toEqual(new Date('2024-09-01'))
  })

  it('maps Open to ACTIVE', () => {
    expect(transformOrder(makeOrder({ status: 'Open' })).status).toBe('ACTIVE')
  })

  it('maps Closed to COMPLETED', () => {
    expect(transformOrder(makeOrder({ status: 'Closed' })).status).toBe('COMPLETED')
  })

  it('maps Voided/Cancelled to CANCELLED', () => {
    expect(transformOrder(makeOrder({ status: 'Voided' })).status).toBe('CANCELLED')
    expect(transformOrder(makeOrder({ status: 'Cancelled' })).status).toBe('CANCELLED')
  })

  it('maps unknown status to DRAFT', () => {
    expect(transformOrder(makeOrder({ status: 'Draft' })).status).toBe('DRAFT')
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
