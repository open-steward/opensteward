import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type InsertnexoInvoice } from '../../../../../../../src/verticals/accounting/adapters/insertnexo/transform/invoice'

function makeInvoice(overrides: Partial<InsertnexoInvoice> = {}): InsertnexoInvoice {
  return {
    Id: '1',
    Numer: 'FV/2024/001',
    DataWystawienia: '2024-01-15',
    TerminPlatnosci: '2024-02-15',
    Brutto: 1230,
    Netto: 1000,
    Vat: 230,
    Status: 'Wystawiona',
    KontrahentId: '42',
    Waluta: 'PLN',
    Pozycje: [],
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps Id to string id', () => {
    expect(transformInvoice(makeInvoice({ Id: 99 })).id).toBe('99')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps invoice number from Numer field', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('FV/2024/001')
  })

  it('maps total amount from Brutto', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(1230)
  })

  it('maps tax amount from Vat', () => {
    expect(transformInvoice(makeInvoice()).taxAmount).toBe(230)
  })

  it('maps DRAFT status for unknown status', () => {
    expect(transformInvoice(makeInvoice({ Status: 'nieznany' })).status).toBe('DRAFT')
  })

  it('maps AUTHORIZED status for Wystawiona', () => {
    expect(transformInvoice(makeInvoice({ Status: 'Wystawiona' })).status).toBe('AUTHORIZED')
  })

  it('maps PAID status for Oplacona', () => {
    expect(transformInvoice(makeInvoice({ Status: 'Oplacona' })).status).toBe('PAID')
  })

  it('maps VOIDED status for Anulowana', () => {
    expect(transformInvoice(makeInvoice({ Status: 'Anulowana' })).status).toBe('VOIDED')
  })

  it('maps contactId from KontrahentId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('42')
  })

  it('maps currency from Waluta', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('PLN')
  })

  it('maps postedAt from DataWystawienia', () => {
    expect(transformInvoice(makeInvoice()).postedAt).toBeInstanceOf(Date)
  })

  it('maps dueAt from TerminPlatnosci', () => {
    expect(transformInvoice(makeInvoice()).dueAt).toBeInstanceOf(Date)
  })

  it('metadata identity', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice({ Id: 99 }))
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
