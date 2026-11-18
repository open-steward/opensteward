import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type FinancioQuote } from '../../../../../../../src/verticals/accounting/adapters/financio/transform/salesorder'

function makeRaw(overrides: Partial<FinancioQuote> = {}): FinancioQuote {
  return {
    id: '800',
    quote_no: 'QT-001',
    quote_date: '2024-08-01',
    expiry_date: '2024-08-31',
    sub_total: 1500,
    tax_total: 90,
    grand_total: 1590,
    status: 'draft',
    customer_id: '10',
    customer_name: 'Acme Pte Ltd',
    items: [],
    ...overrides,
  }
}

describe('transformSalesOrder (financio)', () => {
  it('maps core fields correctly', () => {
    const result = transformSalesOrder(makeRaw())
    expect(result.id).toBe('800')
    expect(result.contactId).toBe('10')
    expect(result.totalAmount).toBe(1590)
  })

  it('parses date as Date object', () => {
    const result = transformSalesOrder(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-08-01'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw({ quote_no: 'QT-SPECIAL' })
    const result = transformSalesOrder(raw)
    expect(result.metadata).toBe(raw)
    expect((result.metadata as Record<string, unknown>)['quote_no']).toBe('QT-SPECIAL')
  })

  it('maps draft status to DRAFT', () => {
    expect(transformSalesOrder(makeRaw({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps sent status to ACTIVE', () => {
    expect(transformSalesOrder(makeRaw({ status: 'sent' })).status).toBe('ACTIVE')
  })

  it('maps accepted status to COMPLETED', () => {
    expect(transformSalesOrder(makeRaw({ status: 'accepted' })).status).toBe('COMPLETED')
  })

  it('maps rejected status to CANCELLED', () => {
    expect(transformSalesOrder(makeRaw({ status: 'rejected' })).status).toBe('CANCELLED')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeRaw())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
