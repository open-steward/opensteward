import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type RivileInvoice } from '../../../../../../../src/verticals/accounting/adapters/rivile/transform/invoice'

function makeInvoice(overrides: Partial<RivileInvoice> = {}): RivileInvoice {
  return {
    id: '77',
    document_no: 'SF-2024-0001',
    date: '2024-05-01',
    due_date: '2024-05-31',
    amount: 4800,
    vat_amount: 800,
    state: 'N',
    client_id: '20',
    currency: 'EUR',
    ...overrides,
  }
}

describe('transformInvoice (rivile)', () => {
  it('maps id', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('77')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps document_no to invoiceNumber', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('SF-2024-0001')
  })

  it('maps total amount', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(4800)
  })

  it('maps DRAFT status for N state', () => {
    expect(transformInvoice(makeInvoice({ state: 'N' })).status).toBe('DRAFT')
  })

  it('maps AUTHORIZED status for I state', () => {
    expect(transformInvoice(makeInvoice({ state: 'I' })).status).toBe('AUTHORIZED')
  })

  it('maps PAID status for A state', () => {
    expect(transformInvoice(makeInvoice({ state: 'A' })).status).toBe('PAID')
  })

  it('maps VOIDED status for S state', () => {
    expect(transformInvoice(makeInvoice({ state: 'S' })).status).toBe('VOIDED')
  })

  it('maps client_id to contactId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('20')
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
