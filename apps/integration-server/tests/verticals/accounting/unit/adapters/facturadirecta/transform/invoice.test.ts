import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type FacturadirectaInvoice } from '../../../../../../../src/verticals/accounting/adapters/facturadirecta/transform/invoice'

function makeInvoice(overrides: Partial<FacturadirectaInvoice> = {}): FacturadirectaInvoice {
  return {
    id: 'inv-001',
    document_number: 'F-2024-001',
    document_date: '2024-01-15',
    payment_date: '2024-02-15',
    base_amount: 8000,
    tax_amount: 1680,
    total_amount: 9680,
    pending_amount: 9680,
    document_status: 'draft',
    client_id: 'cli-001',
    currency: 'EUR',
    lines: [],
    ...overrides,
  }
}

describe('transformInvoice (facturadirecta)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('inv-001')
    expect(result.invoiceNumber).toBe('F-2024-001')
    expect(result.contactId).toBe('cli-001')
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
    expect(transformInvoice(makeInvoice({ document_status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps sent to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ document_status: 'sent' })).status).toBe('AUTHORIZED')
  })

  it('maps paid to PAID', () => {
    expect(transformInvoice(makeInvoice({ document_status: 'paid' })).status).toBe('PAID')
  })

  it('maps cancelled to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ document_status: 'cancelled' })).status).toBe('VOIDED')
  })

  it('maps lines to lineItems', () => {
    const raw = makeInvoice({
      lines: [{ id: 1, description: 'Producto A', unit_price: 150, quantity: 3, total: 450, tax_amount: 94.5, account_id: '705' }],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].totalAmount).toBe(450)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
