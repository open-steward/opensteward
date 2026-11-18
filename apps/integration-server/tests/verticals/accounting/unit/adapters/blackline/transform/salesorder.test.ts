import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type BlacklineSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/blackline/transform/salesorder'

function makeSalesOrder(overrides: Partial<BlacklineSalesOrder> = {}): BlacklineSalesOrder {
  return {
    salesOrderId: 'so-001',
    orderNumber: 'SO-2024-001',
    status: 'Draft',
    accountId: 'acc-123',
    currency: 'USD',
    totalAmount: 3500,
    orderDate: '2024-03-05',
    createdBy: 'user-1',
    createdAt: '2024-03-05T10:00:00Z',
    modifiedBy: 'user-1',
    modifiedAt: '2024-03-05T10:00:00Z',
    lines: [],
    ...overrides,
  }
}

describe('transformSalesOrder (BlackLine)', () => {
  it('maps id from salesOrderId', () => {
    expect(transformSalesOrder(makeSalesOrder()).id).toBe('so-001')
  })

  it('maps core fields', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.contactId).toBe('acc-123')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(3500)
  })

  it('parses orderDate as Date object', () => {
    expect(transformSalesOrder(makeSalesOrder()).postedAt).toEqual(new Date('2024-03-05'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeSalesOrder()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Approved status to ACTIVE', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'Approved' })).status).toBe('ACTIVE')
  })

  it('maps Closed status to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'Closed' })).status).toBe('COMPLETED')
  })

  it('maps Cancelled status to CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'Cancelled' })).status).toBe('CANCELLED')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
