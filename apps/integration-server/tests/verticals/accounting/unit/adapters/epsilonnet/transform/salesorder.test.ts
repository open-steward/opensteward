import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type EpsilonNetSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/epsilonnet/transform/salesorder'

function makeSalesOrder(overrides: Partial<EpsilonNetSalesOrder> = {}): EpsilonNetSalesOrder {
  return {
    id: '7001',
    orderNumber: 'SO-2024-001',
    status: 'Draft',
    issueDate: '2024-03-01',
    totalGrossValue: 1550,
    totalVatAmount: 300,
    currency: 'EUR',
    counterpart: { vatNumber: 'EL222333444' },
    lines: [],
    ...overrides,
  }
}

describe('transformSalesOrder (EpsilonNet)', () => {
  it('maps core fields correctly', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.id).toBe('7001')
    expect(result.contactId).toBe('EL222333444')
    expect(result.totalAmount).toBe(1550)
    expect(result.currency).toBe('EUR')
  })

  it('parses date as Date object', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
  })

  it('maps Submitted to ACTIVE', () => {
    const result = transformSalesOrder(makeSalesOrder({ status: 'Submitted' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps Delivered to COMPLETED', () => {
    const result = transformSalesOrder(makeSalesOrder({ status: 'Delivered' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps Cancelled to CANCELLED', () => {
    const result = transformSalesOrder(makeSalesOrder({ status: 'Cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeSalesOrder()
    const result = transformSalesOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
