import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type XeroCreditNote } from '../../../../../../../src/verticals/accounting/adapters/xero/transform/creditmemo'

function makeCreditNote(overrides: Partial<XeroCreditNote> = {}): XeroCreditNote {
  return {
    CreditNoteID: 'cn-001',
    CreditNoteNumber: 'CN-2024-001',
    Contact: { ContactID: 'cid-1' },
    DateString: '2024-03-15',
    DueDateString: '2024-04-15',
    Total: 3000,
    TotalTax: 500,
    AppliedAmount: 0,
    RemainingCredit: 3000,
    CurrencyCode: 'GBP',
    Status: 'AUTHORISED',
    Type: 'ACCRECCREDIT',
    LineItems: [],
    ...overrides,
  }
}

describe('transformCreditMemo (Xero)', () => {
  it('maps core fields correctly', () => {
    const result = transformCreditMemo(makeCreditNote())
    expect(result.id).toBe('cn-001')
    expect(result.creditmemoNumber).toBe('CN-2024-001')
    expect(result.contactId).toBe('cid-1')
    expect(result.totalAmount).toBe(300000)
    expect(result.taxAmount).toBe(50000)
    expect(result.currency).toBe('GBP')
  })

  it('maps DRAFT status', () => {
    expect(transformCreditMemo(makeCreditNote({ Status: 'DRAFT' })).status).toBe('DRAFT')
  })

  it('maps AUTHORISED with full remaining to AUTHORIZED', () => {
    const result = transformCreditMemo(makeCreditNote({ Status: 'AUTHORISED', AppliedAmount: 0, RemainingCredit: 3000 }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps AUTHORISED with zero remaining to PAID', () => {
    const result = transformCreditMemo(makeCreditNote({ Status: 'AUTHORISED', AppliedAmount: 3000, RemainingCredit: 0 }))
    expect(result.status).toBe('PAID')
  })

  it('maps AUTHORISED with partial applied to PARTIALLY_PAID', () => {
    const result = transformCreditMemo(makeCreditNote({ Status: 'AUTHORISED', AppliedAmount: 1500, RemainingCredit: 1500 }))
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('maps VOIDED status', () => {
    expect(transformCreditMemo(makeCreditNote({ Status: 'VOIDED' })).status).toBe('VOIDED')
  })

  it('maps DELETED status', () => {
    expect(transformCreditMemo(makeCreditNote({ Status: 'DELETED' })).status).toBe('DELETED')
  })

  it('emits postedAt/dueAt as calendar dates, matching the source precision', () => {
    const result = transformCreditMemo(makeCreditNote())
    expect(result.postedAt).toBe('2024-03-15')
    expect(result.dueAt).toBe('2024-04-15')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeCreditNote()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeCreditNote())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
