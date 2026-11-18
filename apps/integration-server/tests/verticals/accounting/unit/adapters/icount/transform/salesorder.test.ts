import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/icount/transform/salesorder'
import type { ICountInvoice } from '../../../../../../../src/verticals/accounting/adapters/icount/transform/invoice'

function makeInvoice(overrides: Partial<ICountInvoice> = {}): ICountInvoice {
  return {
    doc_id: 'so_30',
    doc_type: 'salesorder',
    status: 'open',
    sum: 6000,
    vat_sum: 1020,
    currency_code: 'ILS',
    client_id: 'clt_12',
    date: '2024-03-14',
    doc_number: 'SO-30',
    ...overrides,
  }
}

describe('transformSalesOrder (icount)', () => {
  it('maps core fields correctly', () => {
    const result = transformSalesOrder(makeInvoice())
    expect(result.id).toBe('so_30')
    expect(result.contactId).toBe('clt_12')
    expect(result.totalAmount).toBe(6000)
    expect(result.currency).toBe('ILS')
  })

  it('parses date as Date object', () => {
    const result = transformSalesOrder(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-14'))
  })

  it('maps status open to ACTIVE', () => {
    const result = transformSalesOrder(makeInvoice({ status: 'open' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps status paid to COMPLETED', () => {
    const result = transformSalesOrder(makeInvoice({ status: 'paid' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps status cancelled to CANCELLED', () => {
    const result = transformSalesOrder(makeInvoice({ status: 'cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice()
    const result = transformSalesOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeInvoice())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
