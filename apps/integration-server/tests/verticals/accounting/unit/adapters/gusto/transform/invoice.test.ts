import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type GustoInvoice } from '../../../../../../../src/verticals/accounting/adapters/gusto/transform/invoice'

function makeInvoice(overrides: Partial<GustoInvoice> = {}): GustoInvoice {
  return {
    id: 'pr_123',
    status: 'processed',
    check_date: '2024-03-15',
    processed_date: '2024-03-14',
    company_id: 'co_456',
    gross_pay: 5000,
    net_pay: 3800,
    employee_taxes: 1200,
    currency: 'USD',
    lines: [],
    ...overrides,
  }
}

describe('transformInvoice (Gusto)', () => {
  it('maps id to string', () => {
    const result = transformInvoice(makeInvoice({ id: 'pr_123' }))
    expect(result.id).toBe('pr_123')
  })

  it('maps numeric id to string', () => {
    const result = transformInvoice(makeInvoice({ id: 99 }))
    expect(result.id).toBe('99')
  })

  it('maps gross_pay to totalAmount', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.totalAmount).toBe(5000)
  })

  it('maps employee_taxes to taxAmount', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.taxAmount).toBe(1200)
  })

  it('maps currency', () => {
    const result = transformInvoice(makeInvoice({ currency: 'EUR' }))
    expect(result.currency).toBe('EUR')
  })

  it('defaults currency to USD when absent', () => {
    const raw = makeInvoice()
    delete raw.currency
    const result = transformInvoice(raw)
    expect(result.currency).toBe('USD')
  })

  it('maps company_id to contactId', () => {
    const result = transformInvoice(makeInvoice({ company_id: 'co_789' }))
    expect(result.contactId).toBe('co_789')
  })

  it('parses check_date as Date', () => {
    const result = transformInvoice(makeInvoice({ check_date: '2024-03-15' }))
    expect(result.postedAt).toEqual(new Date('2024-03-15'))
  })

  it('sets type to INVOICE', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.type).toBe('INVOICE')
  })

  it('maps processed status to PAID', () => {
    const result = transformInvoice(makeInvoice({ status: 'processed' }))
    expect(result.status).toBe('PAID')
  })

  it('maps unprocessed status to DRAFT', () => {
    const result = transformInvoice(makeInvoice({ status: 'unprocessed' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps void status to VOIDED', () => {
    const result = transformInvoice(makeInvoice({ status: 'void' }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps unknown status to DRAFT', () => {
    const result = transformInvoice(makeInvoice({ status: 'pending' }))
    expect(result.status).toBe('DRAFT')
  })

  it('passes raw object as metadata by reference', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('maps lines to lineItems', () => {
    const raw = makeInvoice({
      lines: [{ id: 'line_1', description: 'Salary', amount: 4000 }],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('line_1')
    expect(result.lineItems![0].itemDescription).toBe('Salary')
    expect(result.lineItems![0].totalAmount).toBe(4000)
  })

  it('returns empty lineItems when lines is absent', () => {
    const result = transformInvoice(makeInvoice({ lines: [] }))
    expect(result.lineItems).toEqual([])
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice({ id: 'pr_123' }))
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
