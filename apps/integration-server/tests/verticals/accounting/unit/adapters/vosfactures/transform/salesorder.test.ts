import { describe, it, expect } from 'vitest'
import { transformSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/vosfactures/transform/salesorder'
import type { VosFacturesInvoice } from '../../../../../../../src/verticals/accounting/adapters/vosfactures/transform/invoice'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'

function makeSalesOrderRaw(overrides: Partial<VosFacturesInvoice> = {}): VosFacturesInvoice {
  return {
    id: 5005,
    number: 'SO/2024/005',
    kind: 'client_order',
    status: 'sent',
    income: '1',
    issue_date: '2024-09-01',
    currency: 'EUR',
    price_gross: '2400.00',
    client_id: 120,
    ...overrides,
  }
}

describe('transformSalesOrder', () => {
  it('maps core fields correctly', () => {
    const result = transformSalesOrder(makeSalesOrderRaw())
    expect(result.id).toBe('5005')
    expect(result.contactId).toBe('120')
    expect(result.currency).toBe('EUR')
    expect(result.totalAmount).toBe(2400)
  })

  it('maps status sent to ACTIVE', () => {
    const result = transformSalesOrder(makeSalesOrderRaw({ status: 'sent' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps status accepted to COMPLETED', () => {
    const result = transformSalesOrder(makeSalesOrderRaw({ status: 'accepted' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps status rejected to CANCELLED', () => {
    const result = transformSalesOrder(makeSalesOrderRaw({ status: 'rejected' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps status issued to DRAFT', () => {
    const result = transformSalesOrder(makeSalesOrderRaw({ status: 'issued' }))
    expect(result.status).toBe('DRAFT')
  })

  it('parses issue_date as postedAt', () => {
    const result = transformSalesOrder(makeSalesOrderRaw())
    expect(result.postedAt).toEqual(new Date('2024-09-01'))
  })

  it('passes raw as metadata', () => {
    const raw = makeSalesOrderRaw()
    const result = transformSalesOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    const result = transformSalesOrder(makeSalesOrderRaw())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
