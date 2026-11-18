import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type AbraflexiInvoice } from '../../../../../../../src/verticals/accounting/adapters/abraflexi/transform/invoice'

function makeInvoice(overrides: Partial<AbraflexiInvoice> = {}): AbraflexiInvoice {
  return {
    id: '1',
    kod: 'FAC-2024-001',
    datVyst: '2024-01-15',
    datSplat: '2024-02-15',
    sumCelkem: 1210,
    sumDph: 210,
    stavUhrK: 'vydanoK',
    firma: '42',
    mena: 'CZK',
    polozkyFaktury: [],
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

  it('maps invoice number from kod field', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('FAC-2024-001')
  })

  it('maps total amount from sumCelkem', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(1210)
  })

  it('maps tax amount from sumDph', () => {
    expect(transformInvoice(makeInvoice()).taxAmount).toBe(210)
  })

  it('maps DRAFT status for unknown stavUhrK', () => {
    expect(transformInvoice(makeInvoice({ stavUhrK: 'unknown' })).status).toBe('DRAFT')
  })

  it('maps DRAFT status for undefined stavUhrK', () => {
    expect(transformInvoice(makeInvoice({ stavUhrK: undefined })).status).toBe('DRAFT')
  })

  it('maps AUTHORIZED status for vydanoK', () => {
    expect(transformInvoice(makeInvoice({ stavUhrK: 'vydanoK' })).status).toBe('AUTHORIZED')
  })

  it('maps PAID status for uhrazenoComp', () => {
    expect(transformInvoice(makeInvoice({ stavUhrK: 'uhrazenoComp' })).status).toBe('PAID')
  })

  it('maps VOIDED status for stornoK', () => {
    expect(transformInvoice(makeInvoice({ stavUhrK: 'stornoK' })).status).toBe('VOIDED')
  })

  it('maps contactId from firma', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('42')
  })

  it('maps currency from mena', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('CZK')
  })

  it('maps postedAt from datVyst', () => {
    expect(transformInvoice(makeInvoice()).postedAt).toBeInstanceOf(Date)
  })

  it('maps dueAt from datSplat', () => {
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
