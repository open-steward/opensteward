import { describe, it, expect } from 'vitest'
import { expectDate } from '../../../../../../date-assertions'
import {
  transformCreditMemo,
  isCreditMemoType,
} from '../../../../../../../src/verticals/accounting/adapters/saldeo/transform/creditmemo'
import { type SaldeoDocument } from '../../../../../../../src/verticals/accounting/adapters/saldeo/transform/invoice'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'

function makeDoc(overrides: Partial<SaldeoDocument> = {}): SaldeoDocument {
  return {
    DOCUMENT_ID: 'cm-003',
    NUMBER: 'KOR/2024/003',
    ISSUE_DATE: '2024-03-05',
    SALE_DATE: '2024-03-05',
    PAYMENT_DATE: '2024-04-05',
    DOCUMENT_TYPE_TYPE: 'INVOICE_INCOME_CORRECTION',
    CONTRACTOR_ID: 'c-42',
    SUM: '-10.00',
    CURRENCY_ISO4217: 'PLN',
    PAYMENT_TYPE: 'TRANSFER',
    STAGE: 'zatwierdzona',
    IS_DOCUMENT_PAID: 'false',
    IS_CORRECTIVE: 'true',
    VAT_REGISTRIES: [{ RATE: '23', NETTO: '-8.13', VAT: '-1.87' }],
    _raw: '<DOCUMENT><DOCUMENT_ID>cm-003</DOCUMENT_ID></DOCUMENT>',
    ...overrides,
  }
}

describe('isCreditMemoType', () => {
  it('returns true for INVOICE_INCOME_CORRECTION', () => {
    expect(isCreditMemoType('INVOICE_INCOME_CORRECTION')).toBe(true)
  })

  it('returns true for INVOICE_COST_CORRECTION', () => {
    expect(isCreditMemoType('INVOICE_COST_CORRECTION')).toBe(true)
  })

  it('returns true for INVOICE_COST_ADVANCE_CORRECTION', () => {
    expect(isCreditMemoType('INVOICE_COST_ADVANCE_CORRECTION')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isCreditMemoType('invoice_income_correction')).toBe(true)
    expect(isCreditMemoType('Invoice_Cost_Correction')).toBe(true)
  })

  it('returns false for INVOICE_INCOME (non-correction type)', () => {
    expect(isCreditMemoType('INVOICE_INCOME')).toBe(false)
  })

  it('returns false for INVOICE_COST', () => {
    expect(isCreditMemoType('INVOICE_COST')).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isCreditMemoType(undefined)).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isCreditMemoType('')).toBe(false)
  })
})

describe('transformCreditMemo', () => {
  it('maps core fields correctly', () => {
    const result = transformCreditMemo(makeDoc())
    expect(result.id).toBe('cm-003')
    expect(result.creditmemoNumber).toBe('KOR/2024/003')
    expect(result.contactId).toBe('c-42')
    expect(result.currency).toBe('PLN')
  })

  it('converts negative SUM to negative minor units', () => {
    const result = transformCreditMemo(makeDoc({ SUM: '-10.00' }))
    expect(result.totalAmount).toBe(-1000) // -10.00 * 100
  })

  it('converts positive SUM to positive minor units', () => {
    const result = transformCreditMemo(makeDoc({ SUM: '25.50' }))
    expect(result.totalAmount).toBe(2550)
  })

  it('sums VAT_REGISTRIES into taxAmount in minor units (including negatives)', () => {
    const result = transformCreditMemo(
      makeDoc({
        VAT_REGISTRIES: [
          { RATE: '23', NETTO: '-8.13', VAT: '-1.87' },
          { RATE: '8', NETTO: '-5.00', VAT: '-0.40' },
        ],
      }),
    )
    expect(result.taxAmount).toBe(Math.round((-1.87 + -0.4) * 100))
  })

  it('returns undefined taxAmount when VAT_REGISTRIES is empty', () => {
    const result = transformCreditMemo(makeDoc({ VAT_REGISTRIES: [] }))
    expect(result.taxAmount).toBeUndefined()
  })

  it('parses ISSUE_DATE as postedAt Date', () => {
    const result = transformCreditMemo(makeDoc({ ISSUE_DATE: '2024-07-10' }))
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(expectDate(result.postedAt).toISOString().startsWith('2024-07-10')).toBe(true)
  })

  it('parses PAYMENT_DATE as dueAt Date', () => {
    const result = transformCreditMemo(makeDoc({ PAYMENT_DATE: '2024-08-10' }))
    expect(result.dueAt).toBeInstanceOf(Date)
    expect(expectDate(result.dueAt).toISOString().startsWith('2024-08-10')).toBe(true)
  })

  it('maps metadata to { _xml: doc._raw } — not the whole document', () => {
    const raw = makeDoc()
    const result = transformCreditMemo(raw)
    expect(result.metadata).toEqual({ _xml: raw._raw })
  })

  describe('status mapping', () => {
    it('maps IS_DOCUMENT_PAID=true to PAID', () => {
      const result = transformCreditMemo(makeDoc({ IS_DOCUMENT_PAID: 'true', STAGE: undefined }))
      expect(result.status).toBe('PAID')
    })

    it('maps STAGE containing "zatwierdz" to AUTHORIZED', () => {
      const result = transformCreditMemo(
        makeDoc({ STAGE: 'zatwierdzona', IS_DOCUMENT_PAID: 'false' }),
      )
      expect(result.status).toBe('AUTHORIZED')
    })

    it('maps STAGE containing "approv" to AUTHORIZED', () => {
      const result = transformCreditMemo(makeDoc({ STAGE: 'approved', IS_DOCUMENT_PAID: 'false' }))
      expect(result.status).toBe('AUTHORIZED')
    })

    it('maps STAGE containing "anulowan" to VOIDED', () => {
      const result = transformCreditMemo(makeDoc({ STAGE: 'anulowana', IS_DOCUMENT_PAID: 'false' }))
      expect(result.status).toBe('VOIDED')
    })

    it('maps STAGE containing "cancel" to VOIDED', () => {
      const result = transformCreditMemo(makeDoc({ STAGE: 'cancelled', IS_DOCUMENT_PAID: 'false' }))
      expect(result.status).toBe('VOIDED')
    })

    it('defaults to DRAFT when STAGE is absent and not paid', () => {
      const result = transformCreditMemo(makeDoc({ STAGE: undefined, IS_DOCUMENT_PAID: 'false' }))
      expect(result.status).toBe('DRAFT')
    })
  })

  it('returns undefined id when DOCUMENT_ID is empty string', () => {
    const result = transformCreditMemo(makeDoc({ DOCUMENT_ID: '' }))
    expect(result.id).toBeUndefined()
  })

  it('returns undefined contactId when CONTRACTOR_ID is absent', () => {
    const result = transformCreditMemo(makeDoc({ CONTRACTOR_ID: undefined }))
    expect(result.contactId).toBeUndefined()
  })

  it('returns undefined totalAmount when SUM is absent', () => {
    const result = transformCreditMemo(makeDoc({ SUM: undefined }))
    expect(result.totalAmount).toBeUndefined()
  })

  it('passes schema validation', () => {
    const result = transformCreditMemo(makeDoc())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
