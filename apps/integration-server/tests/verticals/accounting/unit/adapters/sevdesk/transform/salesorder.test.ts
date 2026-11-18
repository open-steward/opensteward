import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import {
  transformSalesOrder,
  type SevDeskSalesOrder,
} from '../../../../../../../src/verticals/accounting/adapters/sevdesk/transform/salesorder'

function makeSalesOrder(overrides: Partial<SevDeskSalesOrder> = {}): SevDeskSalesOrder {
  return {
    id: 'so-1',
    orderNumber: 'SO-2024-001',
    contact: { id: 'con-1' },
    orderDate: '2024-09-01',
    currency: 'EUR',
    sumNet: '1500.00',
    sumGross: '1785.00',
    sumTax: '285.00',
    status: '200',
    orderType: 'AN',
    ...overrides,
  }
}

describe('transformSalesOrder', () => {
  it('maps id correctly', () => {
    expect(transformSalesOrder(makeSalesOrder()).id).toBe('so-1')
  })

  it('maps contact id to contactId', () => {
    expect(transformSalesOrder(makeSalesOrder()).contactId).toBe('con-1')
  })

  it('maps currency correctly', () => {
    expect(transformSalesOrder(makeSalesOrder()).currency).toBe('EUR')
  })

  it('parses sumGross as totalAmount', () => {
    expect(transformSalesOrder(makeSalesOrder()).totalAmount).toBe(1785)
  })

  it('parses orderDate as Date object', () => {
    expect(transformSalesOrder(makeSalesOrder()).postedAt).toEqual(new Date('2024-09-01'))
  })

  it('maps status 200 to ACTIVE', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: '200' })).status).toBe('ACTIVE')
  })

  it('maps status 1000 to CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: '1000' })).status).toBe('CANCELLED')
  })

  it('handles null contact', () => {
    expect(transformSalesOrder(makeSalesOrder({ contact: null })).contactId).toBeUndefined()
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
