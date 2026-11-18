import { describe, it, expect } from 'vitest'
import { expectDate } from '../../../../../../date-assertions'
import { transformBill } from '../../../../../../../src/verticals/accounting/adapters/saldeo/transform/bill'
import { type SaldeoDocument } from '../../../../../../../src/verticals/accounting/adapters/saldeo/transform/invoice'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

function makeDoc(overrides: Partial<SaldeoDocument> = {}): SaldeoDocument {
  return {
    DOCUMENT_ID: 'bill-007',
    NUMBER: 'COST/2024/007',
    ISSUE_DATE: '2024-02-01',
    SALE_DATE: '2024-02-01',
    PAYMENT_DATE: '2024-03-01',
    DOCUMENT_TYPE_TYPE: 'INVOICE_COST',
    CONTRACTOR_ID: 'sup-99',
    SUM: '50.00',
    CURRENCY_ISO4217: 'EUR',
    PAYMENT_TYPE: 'TRANSFER',
    STAGE: 'zatwierdzona',
    IS_DOCUMENT_PAID: 'false',
    IS_CORRECTIVE: 'false',
    VAT_REGISTRIES: [{ RATE: '23', NETTO: '40.65', VAT: '9.35' }],
    _raw: '<DOCUMENT><DOCUMENT_ID>bill-007</DOCUMENT_ID></DOCUMENT>',
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps core fields correctly', () => {
    const result = transformBill(makeDoc())
    expect(result.id).toBe('bill-007')
    expect(result.billNumber).toBe('COST/2024/007')
    expect(result.contactId).toBe('sup-99')
    expect(result.currency).toBe('EUR')
    expect(result.totalAmount).toBe(5000) // 50.00 * 100
  })

  it('converts SUM to minor units', () => {
    const result = transformBill(makeDoc({ SUM: '200.99' }))
    expect(result.totalAmount).toBe(Math.round(200.99 * 100))
  })

  it('sums VAT_REGISTRIES into taxAmount in minor units', () => {
    const result = transformBill(
      makeDoc({
        VAT_REGISTRIES: [
          { RATE: '23', NETTO: '40.65', VAT: '9.35' },
          { RATE: '5', NETTO: '10.00', VAT: '0.50' },
        ],
      }),
    )
    expect(result.taxAmount).toBe(Math.round((9.35 + 0.5) * 100))
  })

  it('returns undefined taxAmount when VAT_REGISTRIES is empty', () => {
    const result = transformBill(makeDoc({ VAT_REGISTRIES: [] }))
    expect(result.taxAmount).toBeUndefined()
  })

  it('parses ISSUE_DATE as postedAt Date', () => {
    const result = transformBill(makeDoc({ ISSUE_DATE: '2024-05-20' }))
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(expectDate(result.postedAt).toISOString().startsWith('2024-05-20')).toBe(true)
  })

  it('parses PAYMENT_DATE as dueAt Date', () => {
    const result = transformBill(makeDoc({ PAYMENT_DATE: '2024-06-20' }))
    expect(result.dueAt).toBeInstanceOf(Date)
    expect(expectDate(result.dueAt).toISOString().startsWith('2024-06-20')).toBe(true)
  })

  it('maps metadata to { _xml: doc._raw } — not the whole document', () => {
    const raw = makeDoc()
    const result = transformBill(raw)
    expect(result.metadata).toEqual({ _xml: raw._raw })
  })

  describe('status mapping', () => {
    it('maps IS_DOCUMENT_PAID=true to PAID', () => {
      const result = transformBill(makeDoc({ IS_DOCUMENT_PAID: 'true', STAGE: undefined }))
      expect(result.status).toBe('PAID')
    })

    it('maps STAGE containing "zatwierdz" to AUTHORIZED', () => {
      const result = transformBill(makeDoc({ STAGE: 'zatwierdzona', IS_DOCUMENT_PAID: 'false' }))
      expect(result.status).toBe('AUTHORIZED')
    })

    it('maps STAGE containing "approv" to AUTHORIZED', () => {
      const result = transformBill(makeDoc({ STAGE: 'approved', IS_DOCUMENT_PAID: 'false' }))
      expect(result.status).toBe('AUTHORIZED')
    })

    it('maps STAGE containing "anulowan" to VOIDED', () => {
      const result = transformBill(makeDoc({ STAGE: 'anulowana', IS_DOCUMENT_PAID: 'false' }))
      expect(result.status).toBe('VOIDED')
    })

    it('maps STAGE containing "cancel" to VOIDED', () => {
      const result = transformBill(makeDoc({ STAGE: 'cancelled', IS_DOCUMENT_PAID: 'false' }))
      expect(result.status).toBe('VOIDED')
    })

    it('defaults to DRAFT when STAGE is absent and not paid', () => {
      const result = transformBill(makeDoc({ STAGE: undefined, IS_DOCUMENT_PAID: 'false' }))
      expect(result.status).toBe('DRAFT')
    })
  })

  it('returns undefined id when DOCUMENT_ID is empty string', () => {
    const result = transformBill(makeDoc({ DOCUMENT_ID: '' }))
    expect(result.id).toBeUndefined()
  })

  it('returns undefined contactId when CONTRACTOR_ID is absent', () => {
    const result = transformBill(makeDoc({ CONTRACTOR_ID: undefined }))
    expect(result.contactId).toBeUndefined()
  })

  it('returns undefined totalAmount when SUM is absent', () => {
    const result = transformBill(makeDoc({ SUM: undefined }))
    expect(result.totalAmount).toBeUndefined()
  })

  it('passes schema validation', () => {
    const result = transformBill(makeDoc())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
