import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type ProsvasisSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/prosvasis/transform/salesorder'

function makeSalesOrder(overrides: Partial<ProsvasisSalesOrder> = {}): ProsvasisSalesOrder {
  return {
    id: '7001',
    SeriesNumber: 'SO-2024-001',
    Status: 'Draft',
    Date: '2024-03-01',
    TotalAmount: 1550,
    VatAmount: 300,
    Currency: 'EUR',
    CustomerId: '70',
    Lines: [],
    ...overrides,
  }
}

describe('transformSalesOrder (Prosvasis)', () => {
  it('maps core fields correctly', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.id).toBe('7001')
    expect(result.contactId).toBe('70')
    expect(result.totalAmount).toBe(1550)
    expect(result.currency).toBe('EUR')
  })

  it('parses date as Date object', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
  })

  it('maps Issued to ACTIVE', () => {
    const result = transformSalesOrder(makeSalesOrder({ Status: 'Issued' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps Delivered to COMPLETED', () => {
    const result = transformSalesOrder(makeSalesOrder({ Status: 'Delivered' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps Cancelled to CANCELLED', () => {
    const result = transformSalesOrder(makeSalesOrder({ Status: 'Cancelled' }))
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
