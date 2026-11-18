import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type AccountsIQSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/accountsiq/transform/salesorder'

function makeSalesOrder(overrides: Partial<AccountsIQSalesOrder> = {}): AccountsIQSalesOrder {
  return {
    salesOrderId: '8001',
    entityId: '10',
    status: 'Draft',
    salesOrderNumber: 'SO-2024-001',
    orderDate: '2024-03-12',
    totalAmount: 7500,
    currency: 'EUR',
    contactId: '22',
    lines: [],
    ...overrides,
  }
}

describe('transformSalesOrder (AccountsIQ)', () => {
  it('maps core fields correctly', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.id).toBe('8001')
    expect(result.contactId).toBe('22')
    expect(result.totalAmount).toBe(7500)
    expect(result.currency).toBe('EUR')
  })

  it('parses orderDate as postedAt Date', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.postedAt).toEqual(new Date('2024-03-12'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeSalesOrder()
    const result = transformSalesOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps Draft status to DRAFT', () => {
    const result = transformSalesOrder(makeSalesOrder({ status: 'Draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps Posted status to ACTIVE', () => {
    const result = transformSalesOrder(makeSalesOrder({ status: 'Posted' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps Completed status to COMPLETED', () => {
    const result = transformSalesOrder(makeSalesOrder({ status: 'Completed' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps Cancelled status to CANCELLED', () => {
    const result = transformSalesOrder(makeSalesOrder({ status: 'Cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('returns empty lineItems array when lines is absent', () => {
    const result = transformSalesOrder(makeSalesOrder({ lines: [] }))
    expect(result.lineItems).toEqual([])
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
