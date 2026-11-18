import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import {
  transformSalesOrder,
  type PennylaneSalesOrder,
} from '../../../../../../../src/verticals/accounting/adapters/pennylane/transform/salesorder'

function makeSalesOrder(overrides: Partial<PennylaneSalesOrder> = {}): PennylaneSalesOrder {
  return {
    id: 'so-1',
    reference: 'SO-2024-001',
    customer: { source_id: 'cust-1' },
    date: '2024-10-01',
    currency: 'EUR',
    amount: 2500,
    status: 'draft',
    ...overrides,
  }
}

describe('transformSalesOrder', () => {
  it('maps id correctly', () => {
    expect(transformSalesOrder(makeSalesOrder()).id).toBe('so-1')
  })

  it('maps customer source_id to contactId', () => {
    expect(transformSalesOrder(makeSalesOrder()).contactId).toBe('cust-1')
  })

  it('returns undefined contactId when customer is null', () => {
    expect(transformSalesOrder(makeSalesOrder({ customer: null })).contactId).toBeUndefined()
  })

  it('maps currency correctly', () => {
    expect(transformSalesOrder(makeSalesOrder()).currency).toBe('EUR')
  })

  it('maps amount to totalAmount', () => {
    expect(transformSalesOrder(makeSalesOrder()).totalAmount).toBe(2500)
  })

  it('parses date as Date object', () => {
    expect(transformSalesOrder(makeSalesOrder()).postedAt).toEqual(new Date('2024-10-01'))
  })

  it('maps status draft to ACTIVE', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'draft' })).status).toBe('ACTIVE')
  })

  it('maps status accepted to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'accepted' })).status).toBe('COMPLETED')
  })

  it('maps status invoiced to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'invoiced' })).status).toBe('COMPLETED')
  })

  it('maps status cancelled to CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps status rejected to CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'rejected' })).status).toBe('CANCELLED')
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
