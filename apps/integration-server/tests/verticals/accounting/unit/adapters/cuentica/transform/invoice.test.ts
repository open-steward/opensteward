import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type CuenticaInvoice } from '../../../../../../../src/verticals/accounting/adapters/cuentica/transform/invoice'

function makeInvoice(overrides: Partial<CuenticaInvoice> = {}): CuenticaInvoice {
  return {
    id: 'inv-001',
    number: 'INV-2024-001',
    date: '2024-01-15',
    due_date: '2024-02-15',
    subtotal: 8000,
    tax: 1680,
    total: 9680,
    outstanding: 9680,
    status: 'draft',
    contact_id: 'con-001',
    currency: 'EUR',
    lines: [],
    ...overrides,
  }
}

describe('transformInvoice (cuentica)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('inv-001')
    expect(result.invoiceNumber).toBe('INV-2024-001')
    expect(result.contactId).toBe('con-001')
    expect(result.totalAmount).toBe(9680)
    expect(result.taxAmount).toBe(1680)
    expect(result.balanceAmount).toBe(9680)
    expect(result.currency).toBe('EUR')
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
    expect(result.dueAt).toEqual(new Date('2024-02-15'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('maps draft to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps sent to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 'sent' })).status).toBe('AUTHORIZED')
  })

  it('maps paid to PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps voided to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status: 'voided' })).status).toBe('VOIDED')
  })

  it('maps lines to lineItems', () => {
    const raw = makeInvoice({
      lines: [{ id: 1, description: 'Service B', unit_price: 150, quantity: 4, total: 600, tax: 126, account: '705' }],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].totalAmount).toBe(600)
  })

  it('handles missing optional fields', () => {
    const result = transformInvoice(makeInvoice({ contact_id: '', currency: '' }))
    expect(result.contactId).toBeUndefined()
    expect(result.currency).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
