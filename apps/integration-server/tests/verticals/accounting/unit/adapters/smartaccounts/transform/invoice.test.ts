import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type SmartaccountsInvoice } from '../../../../../../../src/verticals/accounting/adapters/smartaccounts/transform/invoice'

function makeInvoice(overrides: Partial<SmartaccountsInvoice> = {}): SmartaccountsInvoice {
  return {
    id: '10',
    invoice_number: 'SA-2024-001',
    invoice_date: '2024-03-01',
    due_date: '2024-03-31',
    total_amount: 2400,
    vat_amount: 400,
    paid_amount: 0,
    status: 'draft',
    client_id: '5',
    currency: 'EUR',
    ...overrides,
  }
}

describe('transformInvoice (smartaccounts)', () => {
  it('maps id', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('10')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps invoice number', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('SA-2024-001')
  })

  it('maps total amount', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(2400)
  })

  it('maps DRAFT status', () => {
    expect(transformInvoice(makeInvoice({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps AUTHORIZED status for issued', () => {
    expect(transformInvoice(makeInvoice({ status: 'issued' })).status).toBe('AUTHORIZED')
  })

  it('maps PAID status', () => {
    expect(transformInvoice(makeInvoice({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps VOIDED status for void', () => {
    expect(transformInvoice(makeInvoice({ status: 'void' })).status).toBe('VOIDED')
  })

  it('maps contact id', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('5')
  })

  it('metadata identity', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
