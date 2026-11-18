import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import {
  transformSalesOrder,
  type PowerOfficeSalesOrder,
} from '../../../../../../../src/verticals/accounting/adapters/poweroffice/transform/salesorder'

function makeSalesOrder(overrides: Partial<PowerOfficeSalesOrder> = {}): PowerOfficeSalesOrder {
  return {
    id: 500,
    customerId: 25,
    orderDate: '2024-09-01',
    currencyCode: 'NOK',
    grossAmount: 4500,
    status: 1,
    orderNo: 'SO-2024-001',
    ...overrides,
  }
}

describe('transformSalesOrder', () => {
  it('maps id correctly', () => {
    expect(transformSalesOrder(makeSalesOrder()).id).toBe('500')
  })

  it('maps customerId to contactId', () => {
    expect(transformSalesOrder(makeSalesOrder()).contactId).toBe('25')
  })

  it('maps currencyCode to currency', () => {
    expect(transformSalesOrder(makeSalesOrder()).currency).toBe('NOK')
  })

  it('maps grossAmount to totalAmount', () => {
    expect(transformSalesOrder(makeSalesOrder()).totalAmount).toBe(4500)
  })

  it('parses orderDate as Date object for postedAt', () => {
    expect(transformSalesOrder(makeSalesOrder()).postedAt).toEqual(new Date('2024-09-01'))
  })

  it('maps status 5 to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 5 })).status).toBe('COMPLETED')
  })

  it('maps status 9 to CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 9 })).status).toBe('CANCELLED')
  })

  it('maps other status values to ACTIVE', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 1 })).status).toBe('ACTIVE')
    expect(transformSalesOrder(makeSalesOrder({ status: 0 })).status).toBe('ACTIVE')
    expect(transformSalesOrder(makeSalesOrder({ status: 3 })).status).toBe('ACTIVE')
  })

  it('sets contactId to undefined when customerId is falsy', () => {
    expect(transformSalesOrder(makeSalesOrder({ customerId: 0 })).contactId).toBeUndefined()
  })

  it('sets postedAt to undefined when orderDate is empty', () => {
    expect(transformSalesOrder(makeSalesOrder({ orderDate: '' })).postedAt).toBeUndefined()
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
