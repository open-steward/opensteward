import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type CmicSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/cmic/transform/salesorder'

function makeSalesOrder(overrides: Partial<CmicSalesOrder> = {}): CmicSalesOrder {
  return {
    SalesOrderId: 'SO-001',
    OrderNumber: 'CO-2024-001',
    Status: 'Draft',
    ClientId: 'CLI-123',
    ProjectCode: 'PRJ-001',
    Currency: 'USD',
    TotalAmount: 25000,
    OrderDate: '2024-03-01',
    Lines: [],
    ...overrides,
  }
}

describe('transformSalesOrder (CMiC)', () => {
  it('maps id from SalesOrderId', () => {
    expect(transformSalesOrder(makeSalesOrder()).id).toBe('SO-001')
  })

  it('maps core fields', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.contactId).toBe('CLI-123')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(25000)
  })

  it('parses OrderDate as Date object', () => {
    expect(transformSalesOrder(makeSalesOrder()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeSalesOrder()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformSalesOrder(makeSalesOrder({ Status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Approved status to ACTIVE', () => {
    expect(transformSalesOrder(makeSalesOrder({ Status: 'Approved' })).status).toBe('ACTIVE')
  })

  it('maps Closed status to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ Status: 'Closed' })).status).toBe('COMPLETED')
  })

  it('maps Void status to CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ Status: 'Void' })).status).toBe('CANCELLED')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
