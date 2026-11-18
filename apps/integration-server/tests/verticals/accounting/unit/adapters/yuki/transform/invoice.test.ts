import { describe, it, expect } from 'vitest'
import { expectDate } from '../../../../../../date-assertions'
import {
  transformInvoice,
  untransformInvoice,
  type YukiInvoiceResult,
} from '../../../../../../../src/verticals/accounting/adapters/yuki/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makeRaw(overrides: Partial<YukiInvoiceResult> = {}): YukiInvoiceResult {
  return {
    Reference: 'INV-2026-001',
    Date: '2026-02-01',
    DueDate: '2026-03-03',
    Currency: 'EUR',
    ContactCode: 'C-001',
    Subject: 'Annual services',
    Lines: [
      {
        Description: 'Consulting',
        ProductQuantity: 5,
        SalesPrice: 200,
        VATPercentage: 21,
        VATIncluded: false,
        LineAmount: 1000,
        GLAccountCode: '8000',
      },
    ],
    ...overrides,
  }
}

describe('transformInvoice (yuki)', () => {
  it('maps Reference to id', () => {
    expect(transformInvoice(makeRaw()).id).toBe('INV-2026-001')
  })

  it('maps Reference to invoiceNumber', () => {
    expect(transformInvoice(makeRaw()).invoiceNumber).toBe('INV-2026-001')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeRaw()).type).toBe('INVOICE')
  })

  it('sets status to AUTHORIZED', () => {
    expect(transformInvoice(makeRaw()).status).toBe('AUTHORIZED')
  })

  it('maps ContactCode to contactId', () => {
    expect(transformInvoice(makeRaw()).contactId).toBe('C-001')
  })

  it('maps Currency to currency', () => {
    expect(transformInvoice(makeRaw()).currency).toBe('EUR')
  })

  it('computes totalAmount as net + VAT from lines', () => {
    // net=1000, vat=1000*21%=210 → total=1210
    expect(transformInvoice(makeRaw()).totalAmount).toBe(1210)
  })

  it('maps Subject to notes', () => {
    expect(transformInvoice(makeRaw()).notes).toBe('Annual services')
  })

  it('maps Date to postedAt', () => {
    const result = transformInvoice(makeRaw())
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(expectDate(result.postedAt).toISOString()).toBe('2026-02-01T00:00:00.000Z')
  })

  it('maps DueDate to dueAt', () => {
    expect(transformInvoice(makeRaw()).dueAt).toBeInstanceOf(Date)
  })

  it('maps GLAccountCode to line item accountId', () => {
    const li = transformInvoice(makeRaw()).lineItems?.[0]
    expect(li?.accountId).toBe('8000')
  })

  it('maps line Description to itemDescription', () => {
    const li = transformInvoice(makeRaw()).lineItems?.[0]
    expect(li?.itemDescription).toBe('Consulting')
  })

  it('maps SalesPrice to unitAmount', () => {
    const li = transformInvoice(makeRaw()).lineItems?.[0]
    expect(li?.unitAmount).toBe(200)
  })

  it('maps ProductQuantity to unitQuantity', () => {
    const li = transformInvoice(makeRaw()).lineItems?.[0]
    expect(li?.unitQuantity).toBe(5)
  })

  it('produces a schema-valid Invoice', () => {
    expect(() => InvoiceSchema.parse(transformInvoice(makeRaw()))).not.toThrow()
  })

  describe('untransformInvoice', () => {
    it('produces XML containing the Reference', () => {
      const xml = untransformInvoice(
        { invoiceNumber: 'INV-2026-001', currency: 'EUR', lineItems: [] },
        'ADM-001',
      )
      expect(xml).toContain('<Reference>INV-2026-001</Reference>')
    })

    it('includes AdministrationID in XML', () => {
      const xml = untransformInvoice({ lineItems: [] }, 'ADM-001')
      expect(xml).toContain('<AdministrationID>ADM-001</AdministrationID>')
    })

    it('includes Currency in XML', () => {
      const xml = untransformInvoice({ currency: 'EUR', lineItems: [] }, 'ADM-001')
      expect(xml).toContain('<Currency>EUR</Currency>')
    })
  })
})
