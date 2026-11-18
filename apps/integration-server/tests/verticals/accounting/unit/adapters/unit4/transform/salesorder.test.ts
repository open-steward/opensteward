import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type Unit4SalesOrder } from '../../../../../../../src/verticals/accounting/adapters/unit4/transform/salesorder'

function makeSalesOrder(overrides: Partial<Unit4SalesOrder> = {}): Unit4SalesOrder {
  return {
    salesOrderId: 'so_001',
    orderNumber: 'SO-2024-001',
    status: 'Draft',
    customerId: 'cust_25',
    amount: 8000,
    currencyCode: 'EUR',
    orderDate: '2024-03-05',
    lines: [],
    ...overrides,
  }
}

describe('transformSalesOrder (Unit4)', () => {
  it('maps salesOrderId to string id', () => {
    expect(transformSalesOrder(makeSalesOrder({ salesOrderId: 'so_001' })).id).toBe('so_001')
  })

  it('maps numeric salesOrderId to string', () => {
    expect(transformSalesOrder(makeSalesOrder({ salesOrderId: 13 })).id).toBe('13')
  })

  it('maps amount to totalAmount', () => {
    expect(transformSalesOrder(makeSalesOrder({ amount: 9000 })).totalAmount).toBe(9000)
  })

  it('maps customerId to contactId', () => {
    expect(transformSalesOrder(makeSalesOrder({ customerId: 'cust_88' })).contactId).toBe('cust_88')
  })

  it('maps currencyCode to currency', () => {
    expect(transformSalesOrder(makeSalesOrder({ currencyCode: 'USD' })).currency).toBe('USD')
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Active status to ACTIVE', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'Active' })).status).toBe('ACTIVE')
  })

  it('maps Approved status to ACTIVE', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'Approved' })).status).toBe('ACTIVE')
  })

  it('maps Delivered status to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'Delivered' })).status).toBe('COMPLETED')
  })

  it('maps Cancelled status to CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'Cancelled' })).status).toBe('CANCELLED')
  })

  it('maps unknown status to DRAFT', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'Unknown' })).status).toBe('DRAFT')
  })

  it('parses orderDate as Date', () => {
    expect(transformSalesOrder(makeSalesOrder({ orderDate: '2024-03-05' })).postedAt).toEqual(new Date('2024-03-05'))
  })

  it('passes raw object as metadata by reference', () => {
    const raw = makeSalesOrder()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeSalesOrder({ salesOrderId: 'so_001' }))
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
