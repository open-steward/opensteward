import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type SuperfakturaInvoice } from '../../../../../../../src/verticals/accounting/adapters/superfaktura/transform/invoice'

function makeInvoice(overrides: Partial<SuperfakturaInvoice> = {}): SuperfakturaInvoice {
  return {
    id: '10',
    invoice_no: 'SF-2024-010',
    created: '2024-03-01',
    due: '2024-04-01',
    total: 1200,
    tax: 200,
    status: 1,
    client_id: 'c-5',
    currency: 'EUR',
    invoice_items: [],
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps id', () => { expect(transformInvoice(makeInvoice()).id).toBe('10') })
  it('sets type to INVOICE', () => { expect(transformInvoice(makeInvoice()).type).toBe('INVOICE') })
  it('maps invoice_no to invoiceNumber', () => { expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('SF-2024-010') })
  it('maps client_id to contactId', () => { expect(transformInvoice(makeInvoice()).contactId).toBe('c-5') })
  it('maps total to totalAmount', () => { expect(transformInvoice(makeInvoice()).totalAmount).toBe(1200) })
  it('maps tax to taxAmount', () => { expect(transformInvoice(makeInvoice()).taxAmount).toBe(200) })
  it('maps status 1 to DRAFT', () => { expect(transformInvoice(makeInvoice({ status: 1 })).status).toBe('DRAFT') })
  it('maps status 2 to AUTHORIZED', () => { expect(transformInvoice(makeInvoice({ status: 2 })).status).toBe('AUTHORIZED') })
  it('maps status 3 to PAID', () => { expect(transformInvoice(makeInvoice({ status: 3 })).status).toBe('PAID') })
  it('maps status 4 to VOIDED', () => { expect(transformInvoice(makeInvoice({ status: 4 })).status).toBe('VOIDED') })
  it('parses created as postedAt', () => { expect(transformInvoice(makeInvoice()).postedAt).toEqual(new Date('2024-03-01')) })
  it('parses due as dueAt', () => { expect(transformInvoice(makeInvoice()).dueAt).toEqual(new Date('2024-04-01')) })
  it('metadata identity', () => { const raw = makeInvoice(); expect(transformInvoice(raw).metadata).toBe(raw) })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
