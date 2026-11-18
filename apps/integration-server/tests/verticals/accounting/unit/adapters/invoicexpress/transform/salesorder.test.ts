import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type InvoiceXpressSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/invoicexpress/transform/salesorder'

function makeSalesOrder(overrides: Partial<InvoiceXpressSalesOrder> = {}): InvoiceXpressSalesOrder {
  return {
    id: 500,
    date: '2024-08-05',
    client: { id: 90 },
    total: 1500,
    currency: 'EUR',
    ...overrides,
  }
}

describe('transformSalesOrder', () => {
  it('maps core fields correctly', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.id).toBe('500')
    expect(result.contactId).toBe('90')
    expect(result.totalAmount).toBe(1500)
    expect(result.currency).toBe('EUR')
  })

  it('parses date as Date object', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.postedAt).toEqual(new Date('2024-08-05'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeSalesOrder({ total: 2000 })
    const result = transformSalesOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('returns undefined contactId when client.id is 0', () => {
    const result = transformSalesOrder(makeSalesOrder({ client: { id: 0 } }))
    expect(result.contactId).toBeUndefined()
  })

  it('returns undefined postedAt when date is empty', () => {
    const result = transformSalesOrder(makeSalesOrder({ date: '' }))
    expect(result.postedAt).toBeUndefined()
  })

  it('returns undefined currency when empty', () => {
    const result = transformSalesOrder(makeSalesOrder({ currency: '' }))
    expect(result.currency).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
