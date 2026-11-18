import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type SnelStartInvoice,
  type SnelStartInvoiceLine,
} from '../../../../../../../src/verticals/accounting/adapters/snelstart/transform/invoice'

function makeInvoiceLine(overrides: Partial<SnelStartInvoiceLine> = {}): SnelStartInvoiceLine {
  return {
    id: 'line-1',
    omschrijving: 'Consultancy uren',
    bedrag: 1000,
    btwBedrag: 210,
    grootboekrekening: { id: 'acc-8000' },
    aantal: 10,
    stuksprijs: 100,
    btwSoort: { id: 'btw-21' },
    ...overrides,
  }
}

function makeInvoice(overrides: Partial<SnelStartInvoice> = {}): SnelStartInvoice {
  return {
    id: 'inv-001',
    factuurnummer: 'F-2024-001',
    relatie: { id: 'rel-1' },
    factuurbedrag: 12100,
    btw: 2100,
    openstaandSaldo: 12100,
    betaaldBedrag: 0,
    valutacode: 'EUR',
    factuurdatum: '2024-03-15',
    vervalDatum: '2024-04-15',
    factuurstatus: 'openstaand',
    regels: [],
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps id from raw id', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('inv-001')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps factuurnummer to invoiceNumber', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('F-2024-001')
  })

  it('maps relatie.id to contactId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('rel-1')
  })

  it('maps valutacode to currency', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('EUR')
  })

  it('maps factuurbedrag to totalAmount', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(12100)
  })

  it('maps btw to taxAmount', () => {
    expect(transformInvoice(makeInvoice()).taxAmount).toBe(2100)
  })

  it('maps openstaandSaldo to balanceAmount', () => {
    expect(transformInvoice(makeInvoice()).balanceAmount).toBe(12100)
  })

  it('maps factuurdatum to postedAt as Date', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-15'))
  })

  it('maps vervalDatum to dueAt as Date', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.dueAt).toEqual(new Date('2024-04-15'))
  })

  it('returns undefined postedAt when factuurdatum is empty', () => {
    expect(transformInvoice(makeInvoice({ factuurdatum: '' })).postedAt).toBeUndefined()
  })

  it('maps status AUTHORIZED when factuurstatus is openstaand', () => {
    expect(transformInvoice(makeInvoice({ factuurstatus: 'openstaand' })).status).toBe('AUTHORIZED')
  })

  it('maps status PAID when openstaandSaldo is 0 and factuurbedrag > 0', () => {
    expect(
      transformInvoice(makeInvoice({ factuurstatus: 'betaald', openstaandSaldo: 0, factuurbedrag: 12100 })).status,
    ).toBe('PAID')
  })

  it('maps status PARTIALLY_PAID when partially paid', () => {
    expect(
      transformInvoice(makeInvoice({ factuurstatus: 'openstaand', openstaandSaldo: 6000, betaaldBedrag: 6100 })).status,
    ).toBe('PARTIALLY_PAID')
  })

  it('maps status VOIDED when factuurstatus is vervallen', () => {
    expect(transformInvoice(makeInvoice({ factuurstatus: 'vervallen' })).status).toBe('VOIDED')
  })

  it('maps status DRAFT when factuurstatus is concept', () => {
    expect(transformInvoice(makeInvoice({ factuurstatus: 'concept' })).status).toBe('DRAFT')
  })

  it('maps regels to lineItems', () => {
    const raw = makeInvoice({ regels: [makeInvoiceLine()] })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('line-1')
    expect(li.accountId).toBe('acc-8000')
    expect(li.itemDescription).toBe('Consultancy uren')
    expect(li.unitAmount).toBe(100)
    expect(li.unitQuantity).toBe(10)
    expect(li.totalAmount).toBe(1000)
    expect(li.taxAmount).toBe(210)
    expect(li.taxrateId).toBe('btw-21')
  })

  it('passes raw object as metadata', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
