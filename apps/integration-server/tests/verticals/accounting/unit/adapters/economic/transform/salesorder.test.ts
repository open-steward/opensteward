import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type EconomicSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/economic/transform/salesorder'

function makeRaw(overrides: Partial<EconomicSalesOrder> = {}): EconomicSalesOrder {
  return {
    orderNumber: 1,
    date: '2024-07-01',
    currency: 'DKK',
    netAmount: 800,
    grossAmount: 1000,
    customer: { customerNumber: 1, name: 'Customer A' },
    lines: [],
    isArchived: false,
    isSent: false,
    ...overrides,
  }
}

describe('economic transformSalesOrder', () => {
  it('maps orderNumber to id', () => {
    expect(transformSalesOrder(makeRaw()).id).toBe('1')
  })
  it('handles fields gracefully', () => {
    expect(() => transformSalesOrder(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })
  it('maps isArchived true -> COMPLETED', () => {
    expect(transformSalesOrder(makeRaw({ isArchived: true })).status).toBe('COMPLETED')
  })
  it('maps customer.customerNumber to contactId', () => {
    expect(transformSalesOrder(makeRaw()).contactId).toBe('1')
  })
  it('maps date to postedAt as Date', () => {
    expect(transformSalesOrder(makeRaw()).postedAt).toEqual(new Date('2024-07-01'))
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeRaw())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
