import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type PohodaInvoice } from '../../../../../../../src/verticals/accounting/adapters/pohoda/transform/invoice'

function makeInvoice(overrides: Partial<PohodaInvoice> = {}): PohodaInvoice {
  return {
    id: '1',
    number: 'FAK2024001',
    date: '2024-01-15',
    maturity: '2024-02-15',
    totalAmount: 1210,
    vatAmount: 210,
    state: 2,
    partnerId: '42',
    currency: 'CZK',
    items: [],
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps id to string', () => {
    expect(transformInvoice(makeInvoice({ id: 99 })).id).toBe('99')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps invoice number from number field', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('FAK2024001')
  })

  it('maps total amount from totalAmount', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(1210)
  })

  it('maps tax amount from vatAmount', () => {
    expect(transformInvoice(makeInvoice()).taxAmount).toBe(210)
  })

  it('maps DRAFT status for state 1', () => {
    expect(transformInvoice(makeInvoice({ state: 1 })).status).toBe('DRAFT')
  })

  it('maps DRAFT status for undefined state', () => {
    expect(transformInvoice(makeInvoice({ state: undefined })).status).toBe('DRAFT')
  })

  it('maps AUTHORIZED status for state 2', () => {
    expect(transformInvoice(makeInvoice({ state: 2 })).status).toBe('AUTHORIZED')
  })

  it('maps PAID status for state 3', () => {
    expect(transformInvoice(makeInvoice({ state: 3 })).status).toBe('PAID')
  })

  it('maps VOIDED status for state 0', () => {
    expect(transformInvoice(makeInvoice({ state: 0 })).status).toBe('VOIDED')
  })

  it('maps contactId from partnerId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('42')
  })

  it('maps currency from currency field', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('CZK')
  })

  it('maps postedAt from date', () => {
    expect(transformInvoice(makeInvoice()).postedAt).toBeInstanceOf(Date)
  })

  it('maps dueAt from maturity', () => {
    expect(transformInvoice(makeInvoice()).dueAt).toBeInstanceOf(Date)
  })

  it('metadata identity', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice({ id: 99 }))
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
