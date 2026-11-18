import { describe, it, expect } from 'vitest'
import {
  transformCreditMemo,
  type ReckonOneCreditNote,
} from '../../../../../../../src/verticals/accounting/adapters/reckon-one/transform/creditmemo'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'

function makeCreditNote(overrides: Partial<ReckonOneCreditNote> = {}): ReckonOneCreditNote {
  return {
    id: 'cn_001',
    creditNoteNumber: 'CN-2024-001',
    customer: { id: 'cust_001', name: 'Widget Co' },
    date: '2024-03-15',
    dueDate: '2024-04-15',
    totalAmount: 550.0,
    amountOwing: 275.0,
    currency: 'AUD',
    status: 'AUTHORISED',
    notes: 'Partial return credit',
    lines: [
      {
        id: 'line_001',
        accountId: 'acct_rev',
        description: 'Widget A return',
        unitPrice: 50.0,
        quantity: 10,
        amount: 500.0,
        taxAmount: 50.0,
      },
    ],
    createdDateTime: '2024-03-14T10:00:00Z',
    modifiedDateTime: '2024-03-15T09:00:00Z',
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps id', () => {
    expect(transformCreditMemo(makeCreditNote()).id).toBe('cn_001')
  })

  it('maps creditNoteNumber to creditmemoNumber', () => {
    expect(transformCreditMemo(makeCreditNote()).creditmemoNumber).toBe('CN-2024-001')
  })

  it('maps customer.id to contactId', () => {
    expect(transformCreditMemo(makeCreditNote()).contactId).toBe('cust_001')
  })

  it('maps currency', () => {
    expect(transformCreditMemo(makeCreditNote()).currency).toBe('AUD')
  })

  it('converts totalAmount to minor units', () => {
    expect(transformCreditMemo(makeCreditNote()).totalAmount).toBe(55000)
  })

  it('converts amountOwing to balanceAmount in minor units', () => {
    expect(transformCreditMemo(makeCreditNote()).balanceAmount).toBe(27500)
  })

  it('computes paidAmount = totalAmount - amountOwing in minor units', () => {
    expect(transformCreditMemo(makeCreditNote()).paidAmount).toBe(27500)
  })

  it('maps date to postedAt as Date', () => {
    expect(transformCreditMemo(makeCreditNote()).postedAt).toEqual(new Date('2024-03-15'))
  })

  it('maps PAID status to PAID', () => {
    expect(transformCreditMemo(makeCreditNote({ status: 'PAID' })).status).toBe('PAID')
  })

  it('maps DRAFT status to DRAFT', () => {
    expect(transformCreditMemo(makeCreditNote({ status: 'DRAFT' })).status).toBe('DRAFT')
  })

  it('maps VOIDED status to VOIDED', () => {
    expect(transformCreditMemo(makeCreditNote({ status: 'VOIDED', amountOwing: 100 })).status).toBe(
      'VOIDED',
    )
  })

  it('sets status PAID when totalAmount>0 and amountOwing===0', () => {
    expect(transformCreditMemo(makeCreditNote({ amountOwing: 0, status: '' })).status).toBe('PAID')
  })

  it('sets PARTIALLY_PAID when owing < total and total > 0', () => {
    // makeCreditNote has amountOwing=275 < totalAmount=550
    expect(transformCreditMemo(makeCreditNote()).status).toBe('PARTIALLY_PAID')
  })

  it('maps lines to lineItems with minor unit conversion', () => {
    const result = transformCreditMemo(makeCreditNote())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems?.[0].accountId).toBe('acct_rev')
    expect(result.lineItems?.[0].unitAmount).toBe(5000)
    expect(result.lineItems?.[0].totalAmount).toBe(50000)
    expect(result.lineItems?.[0].taxAmount).toBe(5000)
  })

  it('passes raw object as metadata', () => {
    const raw = makeCreditNote()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })

  it('produces output that passes CreditMemoSchema validation', () => {
    expect(() => CreditMemoSchema.parse(transformCreditMemo(makeCreditNote()))).not.toThrow()
  })

  it('produces schema-valid output when optional fields are absent', () => {
    const result = transformCreditMemo({ id: 'cn_001' })
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
