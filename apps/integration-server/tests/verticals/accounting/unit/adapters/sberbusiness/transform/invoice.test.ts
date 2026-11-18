import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type SberbusinessInvoice } from '../../../../../../../src/verticals/accounting/adapters/sberbusiness/transform/invoice'

function makeInvoice(overrides: Partial<SberbusinessInvoice> = {}): SberbusinessInvoice {
  return {
    invoiceId: 'sb-001',
    invoiceNumber: 'SB-2024-001',
    invoiceDate: '2024-01-15',
    dueDate: '2024-02-15',
    totalAmount: 1230,
    vatAmount: 230,
    status: 'SENT',
    clientId: 'client-42',
    currencyCode: 'RUB',
    lines: [],
    ...overrides,
  }
}

describe('transformInvoice (sberbusiness)', () => {
  it('maps id from invoiceId', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('sb-001')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps invoice number from invoiceNumber', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('SB-2024-001')
  })

  it('maps total amount from totalAmount', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(1230)
  })

  it('maps tax amount from vatAmount', () => {
    expect(transformInvoice(makeInvoice()).taxAmount).toBe(230)
  })

  it('maps AUTHORIZED status for CREATED', () => {
    expect(transformInvoice(makeInvoice({ status: 'CREATED' })).status).toBe('AUTHORIZED')
  })

  it('maps AUTHORIZED status for SENT', () => {
    expect(transformInvoice(makeInvoice({ status: 'SENT' })).status).toBe('AUTHORIZED')
  })

  it('maps PAID status for PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'PAID' })).status).toBe('PAID')
  })

  it('maps VOIDED status for CANCELLED', () => {
    expect(transformInvoice(makeInvoice({ status: 'CANCELLED' })).status).toBe('VOIDED')
  })

  it('maps DRAFT status for unknown', () => {
    expect(transformInvoice(makeInvoice({ status: 'UNKNOWN' })).status).toBe('DRAFT')
  })

  it('maps contactId from clientId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('client-42')
  })

  it('maps currency from currencyCode', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('RUB')
  })

  it('maps postedAt from invoiceDate', () => {
    expect(transformInvoice(makeInvoice()).postedAt).toBeInstanceOf(Date)
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
