import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type ComarchoptimaInvoice } from '../../../../../../../src/verticals/accounting/adapters/comarchoptima/transform/invoice'

function makeInvoice(overrides: Partial<ComarchoptimaInvoice> = {}): ComarchoptimaInvoice {
  return {
    id: '1',
    numer: 'FV/2024/001',
    data_wystawienia: '2024-01-15',
    termin_platnosci: '2024-02-15',
    wartosc_brutto: 1230,
    wartosc_netto: 1000,
    wartosc_vat: 230,
    status: 'wystawiona',
    kontrahent_id: '42',
    waluta: 'PLN',
    pozycje: [],
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

  it('maps invoice number from numer field', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('FV/2024/001')
  })

  it('maps total amount from wartosc_brutto', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(1230)
  })

  it('maps tax amount from wartosc_vat', () => {
    expect(transformInvoice(makeInvoice()).taxAmount).toBe(230)
  })

  it('maps DRAFT status for unknown status', () => {
    expect(transformInvoice(makeInvoice({ status: 'nieznany' })).status).toBe('DRAFT')
  })

  it('maps DRAFT status for undefined status', () => {
    expect(transformInvoice(makeInvoice({ status: undefined })).status).toBe('DRAFT')
  })

  it('maps AUTHORIZED status for wystawiona', () => {
    expect(transformInvoice(makeInvoice({ status: 'wystawiona' })).status).toBe('AUTHORIZED')
  })

  it('maps PAID status for oplacona', () => {
    expect(transformInvoice(makeInvoice({ status: 'oplacona' })).status).toBe('PAID')
  })

  it('maps VOIDED status for anulowana', () => {
    expect(transformInvoice(makeInvoice({ status: 'anulowana' })).status).toBe('VOIDED')
  })

  it('maps PARTIALLY_PAID status for czesciowo_oplacona', () => {
    expect(transformInvoice(makeInvoice({ status: 'czesciowo_oplacona' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps contactId from kontrahent_id', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('42')
  })

  it('maps currency from waluta', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('PLN')
  })

  it('maps postedAt from data_wystawienia', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toBeInstanceOf(Date)
  })

  it('maps dueAt from termin_platnosci', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.dueAt).toBeInstanceOf(Date)
  })

  it('maps line items from pozycje', () => {
    const invoice = makeInvoice({
      pozycje: [{ id: '10', opis: 'Service', cena_netto: 100, ilosc: 2, wartosc_netto: 200, wartosc_vat: 46 }],
    })
    const result = transformInvoice(invoice)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('10')
    expect(result.lineItems![0].itemDescription).toBe('Service')
    expect(result.lineItems![0].unitAmount).toBe(100)
    expect(result.lineItems![0].unitQuantity).toBe(2)
  })

  it('metadata identity — raw object is assigned as metadata', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice({ id: 99 }))
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
