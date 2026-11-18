import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type JumisInvoice } from '../../../../../../../src/verticals/accounting/adapters/jumis/transform/invoice'

function makeInvoice(overrides: Partial<JumisInvoice> = {}): JumisInvoice {
  return {
    id: '55',
    number: 'R-2024/001',
    date: '2024-04-01',
    due_date: '2024-04-30',
    total: 3600,
    tax: 600,
    status: 'draft',
    partner_id: '12',
    currency: 'EUR',
    ...overrides,
  }
}

describe('transformInvoice (jumis)', () => {
  it('maps id', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('55')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps invoice number', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('R-2024/001')
  })

  it('maps total amount', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(3600)
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

  it('maps VOIDED status for cancelled', () => {
    expect(transformInvoice(makeInvoice({ status: 'cancelled' })).status).toBe('VOIDED')
  })

  it('maps partner_id to contactId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('12')
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
