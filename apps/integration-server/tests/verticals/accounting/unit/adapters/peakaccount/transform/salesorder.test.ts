import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type PeakAccountSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/peakaccount/transform/salesorder'

function makeSalesOrder(overrides: Partial<PeakAccountSalesOrder> = {}): PeakAccountSalesOrder {
  return {
    id: 'SO-001',
    documentNo: 'SO-2024-001',
    status: 'pending',
    issueDate: '2024-01-08',
    totalAmount: 15000,
    currency: 'THB',
    contactId: 'CUST-002',
    items: [],
    ...overrides,
  }
}

describe('transformSalesOrder', () => {
  it('maps core fields correctly', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.id).toBe('SO-001')
    expect(result.contactId).toBe('CUST-002')
    expect(result.totalAmount).toBe(15000)
    expect(result.currency).toBe('THB')
  })

  it('parses date as Date object', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.postedAt).toEqual(new Date('2024-01-08'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeSalesOrder()
    const result = transformSalesOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps pending status to ACTIVE', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'pending' })).status).toBe('ACTIVE')
  })

  it('maps approved status to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'approved' })).status).toBe('COMPLETED')
  })

  it('maps cancelled status to CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps draft status to DRAFT', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
