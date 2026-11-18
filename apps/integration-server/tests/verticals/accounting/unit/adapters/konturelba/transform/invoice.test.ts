import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type KonturelbaInvoice } from '../../../../../../../src/verticals/accounting/adapters/konturelba/transform/invoice'

function makeInvoice(overrides: Partial<KonturelbaInvoice> = {}): KonturelbaInvoice {
  return {
    id: 'ke-001',
    number: 'КЕ-2024-001',
    date: '2024-01-15',
    dueDate: '2024-02-15',
    total: 1230,
    vatTotal: 230,
    status: 'sent',
    counterpartyId: '42',
    currencyCode: 'RUB',
    lines: [],
    ...overrides,
  }
}

describe('transformInvoice (konturelba)', () => {
  it('maps id field', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('ke-001')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps invoice number from number field', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('КЕ-2024-001')
  })

  it('maps total amount from total', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(1230)
  })

  it('maps tax amount from vatTotal', () => {
    expect(transformInvoice(makeInvoice()).taxAmount).toBe(230)
  })

  it('maps AUTHORIZED status for sent', () => {
    expect(transformInvoice(makeInvoice({ status: 'sent' })).status).toBe('AUTHORIZED')
  })

  it('maps PAID status for paid', () => {
    expect(transformInvoice(makeInvoice({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps VOIDED status for cancelled', () => {
    expect(transformInvoice(makeInvoice({ status: 'cancelled' })).status).toBe('VOIDED')
  })

  it('maps DRAFT status for draft', () => {
    expect(transformInvoice(makeInvoice({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps DRAFT status for unknown', () => {
    expect(transformInvoice(makeInvoice({ status: 'unknown' })).status).toBe('DRAFT')
  })

  it('maps contactId from counterpartyId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('42')
  })

  it('maps currency from currencyCode', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('RUB')
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
