import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import {
  transformSalesOrder,
  type IntacctSalesOrder,
} from '../../../../../../../src/verticals/accounting/adapters/sageintacct/transform/salesorder'

function makeSalesOrder(overrides: Partial<IntacctSalesOrder> = {}): IntacctSalesOrder {
  return {
    RECORDNO: 'so-1',
    DOCID: 'SO-2024-001',
    CUSTOMERID: 'cust-1',
    WHENORDERED: '2024-03-01',
    WHENEXPIRED: '2024-06-01',
    CURRENCY: 'USD',
    TOTAL: '1500.00',
    STATE: 'Pending',
    ...overrides,
  }
}

describe('transformSalesOrder', () => {
  it('maps RECORDNO to id', () => {
    expect(transformSalesOrder(makeSalesOrder()).id).toBe('so-1')
  })

  it('maps CUSTOMERID to contactId', () => {
    expect(transformSalesOrder(makeSalesOrder()).contactId).toBe('cust-1')
  })

  it('maps CURRENCY correctly', () => {
    expect(transformSalesOrder(makeSalesOrder()).currency).toBe('USD')
  })

  it('parses TOTAL as totalAmount', () => {
    expect(transformSalesOrder(makeSalesOrder()).totalAmount).toBe(1500)
  })

  it('parses WHENORDERED as Date', () => {
    expect(transformSalesOrder(makeSalesOrder()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('maps STATE Draft to ACTIVE', () => {
    expect(transformSalesOrder(makeSalesOrder({ STATE: 'Draft' })).status).toBe('ACTIVE')
  })

  it('maps STATE Pending to ACTIVE', () => {
    expect(transformSalesOrder(makeSalesOrder({ STATE: 'Pending' })).status).toBe('ACTIVE')
  })

  it('maps STATE Closed to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ STATE: 'Closed' })).status).toBe('COMPLETED')
  })

  it('maps STATE Cancelled to CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ STATE: 'Cancelled' })).status).toBe('CANCELLED')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeSalesOrder()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
