import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type FoundationSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/foundation/transform/salesorder'

function makeSalesOrder(overrides: Partial<FoundationSalesOrder> = {}): FoundationSalesOrder {
  return {
    SalesOrderId: 'SO-001',
    SalesOrderNumber: 'SO-2024-001',
    JobNumber: 'JOB-100',
    OwnerId: 'OWNER-5',
    OrderDate: '2024-03-01',
    TotalAmount: 50000,
    Currency: 'USD',
    Status: 'Draft',
    Lines: [],
    ...overrides,
  }
}

describe('transformSalesOrder (Foundation)', () => {
  it('maps core fields correctly', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.id).toBe('SO-001')
    expect(result.contactId).toBe('OWNER-5')
    expect(result.totalAmount).toBe(50000)
    expect(result.currency).toBe('USD')
  })

  it('parses date as Date object', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeSalesOrder()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformSalesOrder(makeSalesOrder({ Status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Approved status to ACTIVE', () => {
    expect(transformSalesOrder(makeSalesOrder({ Status: 'Approved' })).status).toBe('ACTIVE')
  })

  it('maps Completed status to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ Status: 'Completed' })).status).toBe('COMPLETED')
  })

  it('maps Cancelled status to CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ Status: 'Cancelled' })).status).toBe('CANCELLED')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
