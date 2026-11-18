import { describe, it, expect } from 'vitest'
import { expectDate } from '../../../../../../date-assertions'
import {
  transformInvoice,
  type SaldeoDocument,
} from '../../../../../../../src/verticals/accounting/adapters/saldeo/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makeDoc(overrides: Partial<SaldeoDocument> = {}): SaldeoDocument {
  return {
    DOCUMENT_ID: 'doc-001',
    NUMBER: 'INV/2024/001',
    ISSUE_DATE: '2024-01-15',
    SALE_DATE: '2024-01-15',
    PAYMENT_DATE: '2024-02-15',
    DOCUMENT_TYPE_TYPE: 'INVOICE_INCOME',
    CONTRACTOR_ID: 'c-42',
    SUM: '10.00',
    CURRENCY_ISO4217: 'PLN',
    PAYMENT_TYPE: 'TRANSFER',
    STAGE: 'zatwierdzona',
    IS_DOCUMENT_PAID: 'false',
    IS_CORRECTIVE: 'false',
    VAT_REGISTRIES: [{ RATE: '23', NETTO: '8.13', VAT: '1.87' }],
    _raw: '<DOCUMENT><DOCUMENT_ID>doc-001</DOCUMENT_ID></DOCUMENT>',
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeDoc())
    expect(result.id).toBe('doc-001')
    expect(result.type).toBe('INVOICE')
    expect(result.invoiceNumber).toBe('INV/2024/001')
    expect(result.contactId).toBe('c-42')
    expect(result.currency).toBe('PLN')
    expect(result.totalAmount).toBe(1000) // 10.00 * 100 = 1000
  })

  it('converts SUM to minor units via Math.round', () => {
    const result = transformInvoice(makeDoc({ SUM: '125.50' }))
    expect(result.totalAmount).toBe(12550)
  })

  it('sums VAT_REGISTRIES into taxAmount in minor units', () => {
    const result = transformInvoice(
      makeDoc({
        VAT_REGISTRIES: [
          { RATE: '23', NETTO: '8.13', VAT: '1.87' },
          { RATE: '8', NETTO: '5.00', VAT: '0.40' },
        ],
      }),
    )
    // (1.87 + 0.40) * 100 = 227 (rounded)
    expect(result.taxAmount).toBe(Math.round((1.87 + 0.4) * 100))
  })

  it('returns undefined taxAmount when VAT_REGISTRIES is empty array', () => {
    const result = transformInvoice(makeDoc({ VAT_REGISTRIES: [] }))
    expect(result.taxAmount).toBeUndefined()
  })

  it('returns undefined taxAmount when VAT_REGISTRIES is absent', () => {
    const result = transformInvoice(makeDoc({ VAT_REGISTRIES: undefined }))
    expect(result.taxAmount).toBeUndefined()
  })

  it('parses ISSUE_DATE as postedAt Date', () => {
    const result = transformInvoice(makeDoc({ ISSUE_DATE: '2024-03-10' }))
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(expectDate(result.postedAt).toISOString().startsWith('2024-03-10')).toBe(true)
  })

  it('parses PAYMENT_DATE as dueAt Date', () => {
    const result = transformInvoice(makeDoc({ PAYMENT_DATE: '2024-04-01' }))
    expect(result.dueAt).toBeInstanceOf(Date)
    expect(expectDate(result.dueAt).toISOString().startsWith('2024-04-01')).toBe(true)
  })

  it('maps metadata to { _xml: doc._raw } — not the whole document', () => {
    const raw = makeDoc()
    const result = transformInvoice(raw)
    expect(result.metadata).toEqual({ _xml: raw._raw })
  })

  describe('status mapping', () => {
    it('maps IS_DOCUMENT_PAID=true to PAID', () => {
      const result = transformInvoice(makeDoc({ IS_DOCUMENT_PAID: 'true', STAGE: undefined }))
      expect(result.status).toBe('PAID')
    })

    it('maps STAGE containing "zatwierdz" to AUTHORIZED', () => {
      const result = transformInvoice(makeDoc({ STAGE: 'zatwierdzona', IS_DOCUMENT_PAID: 'false' }))
      expect(result.status).toBe('AUTHORIZED')
    })

    it('maps STAGE containing "approv" to AUTHORIZED', () => {
      const result = transformInvoice(makeDoc({ STAGE: 'approved', IS_DOCUMENT_PAID: 'false' }))
      expect(result.status).toBe('AUTHORIZED')
    })

    it('maps STAGE containing "anulowan" to VOIDED', () => {
      const result = transformInvoice(makeDoc({ STAGE: 'anulowana', IS_DOCUMENT_PAID: 'false' }))
      expect(result.status).toBe('VOIDED')
    })

    it('maps STAGE containing "cancel" to VOIDED', () => {
      const result = transformInvoice(makeDoc({ STAGE: 'cancelled', IS_DOCUMENT_PAID: 'false' }))
      expect(result.status).toBe('VOIDED')
    })

    it('defaults to DRAFT when STAGE is absent and not paid', () => {
      const result = transformInvoice(makeDoc({ STAGE: undefined, IS_DOCUMENT_PAID: 'false' }))
      expect(result.status).toBe('DRAFT')
    })

    it('VOIDED takes priority over IS_DOCUMENT_PAID=true', () => {
      const result = transformInvoice(makeDoc({ STAGE: 'anulowana', IS_DOCUMENT_PAID: 'true' }))
      expect(result.status).toBe('VOIDED')
    })
  })

  it('returns undefined id when DOCUMENT_ID is empty string', () => {
    const result = transformInvoice(makeDoc({ DOCUMENT_ID: '' }))
    expect(result.id).toBeUndefined()
  })

  it('returns undefined contactId when CONTRACTOR_ID is absent', () => {
    const result = transformInvoice(makeDoc({ CONTRACTOR_ID: undefined }))
    expect(result.contactId).toBeUndefined()
  })

  it('returns undefined totalAmount when SUM is absent', () => {
    const result = transformInvoice(makeDoc({ SUM: undefined }))
    expect(result.totalAmount).toBeUndefined()
  })

  it('passes schema validation', () => {
    const result = transformInvoice(makeDoc())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
