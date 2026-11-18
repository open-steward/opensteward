import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type LogoSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/logoyazilim/transform/salesorder'

function makeSalesOrder(overrides: Partial<LogoSalesOrder> = {}): LogoSalesOrder {
  return {
    id: '1000',
    Date: '2024-07-01',
    Status: 'Active',
    ContactId: '77',
    TotalAmount: 12000,
    ...overrides,
  }
}

describe('transformSalesOrder (logoyazilim)', () => {
  it('maps id correctly', () => {
    expect(transformSalesOrder(makeSalesOrder()).id).toBe('1000')
  })

  it('maps totalAmount and contactId', () => {
    const so = transformSalesOrder(makeSalesOrder())
    expect(so.totalAmount).toBe(12000)
    expect(so.contactId).toBe('77')
  })

  it('maps Active status to ACTIVE', () => {
    expect(transformSalesOrder(makeSalesOrder({ Status: 'Active' })).status).toBe('ACTIVE')
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformSalesOrder(makeSalesOrder({ Status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Completed status to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ Status: 'Completed' })).status).toBe('COMPLETED')
  })

  it('maps Cancelled status to CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ Status: 'Cancelled' })).status).toBe('CANCELLED')
  })

  it('parses date as Date object', () => {
    expect(transformSalesOrder(makeSalesOrder()).postedAt).toEqual(new Date('2024-07-01'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeSalesOrder()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw: LogoSalesOrder = { id: '9999' }
    const so = transformSalesOrder(raw)
    expect(so.id).toBe('9999')
    expect(so.totalAmount).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
