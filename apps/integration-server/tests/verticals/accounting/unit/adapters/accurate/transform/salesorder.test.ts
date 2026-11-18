import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type AccurateSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/accurate/transform/salesorder'

function makeSalesOrder(overrides: Partial<AccurateSalesOrder> = {}): AccurateSalesOrder {
  return {
    id: 10001,
    number: 'SOR/2024/001',
    status: 'Open',
    transactionDate: '2024-10-01',
    customerNo: 'C-010',
    totalAmount: 4400000,
    currencyCode: 'IDR',
    detailItem: [],
    ...overrides,
  }
}

describe('transformSalesOrder (accurate)', () => {
  it('maps core fields correctly', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.id).toBe('10001')
    expect(result.contactId).toBe('C-010')
    expect(result.totalAmount).toBe(4400000)
    expect(result.currency).toBe('IDR')
  })

  it('parses date as Date object', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.postedAt).toEqual(new Date('2024-10-01'))
  })

  it('maps Open to ACTIVE', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'Open' })).status).toBe('ACTIVE')
  })

  it('maps Closed to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'Closed' })).status).toBe('COMPLETED')
  })

  it('maps Cancelled to CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'Cancelled' })).status).toBe('CANCELLED')
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
