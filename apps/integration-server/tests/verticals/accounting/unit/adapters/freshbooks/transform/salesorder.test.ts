import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import {
  transformSalesOrder,
  type FreshBooksSalesOrder,
} from '../../../../../../../src/verticals/accounting/adapters/freshbooks/transform/salesorder'

function makeSalesOrder(overrides: Partial<FreshBooksSalesOrder> = {}): FreshBooksSalesOrder {
  return {
    id: 700,
    client_id: 55,
    so_number: 'SO-2024-001',
    date: '2024-03-01',
    currency_code: 'USD',
    amount: { amount: '1200.00', code: 'USD' },
    status: 4,
    ...overrides,
  }
}

describe('transformSalesOrder', () => {
  it('maps id correctly (number to string)', () => {
    expect(transformSalesOrder(makeSalesOrder()).id).toBe('700')
  })

  it('maps client_id to contactId', () => {
    expect(transformSalesOrder(makeSalesOrder()).contactId).toBe('55')
  })

  it('maps currency_code to currency', () => {
    expect(transformSalesOrder(makeSalesOrder()).currency).toBe('USD')
  })

  it('parses amount to totalAmount', () => {
    expect(transformSalesOrder(makeSalesOrder()).totalAmount).toBe(1200)
  })

  it('parses date as Date object for postedAt', () => {
    expect(transformSalesOrder(makeSalesOrder()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('maps status 1 to DRAFT', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 1 })).status).toBe('DRAFT')
  })

  it('maps status 4 to ACTIVE', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 4 })).status).toBe('ACTIVE')
  })

  it('maps status 5 to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 5 })).status).toBe('COMPLETED')
  })

  it('maps status 6 to CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 6 })).status).toBe('CANCELLED')
  })

  it('maps unknown status to DRAFT', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 99 })).status).toBe('DRAFT')
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
