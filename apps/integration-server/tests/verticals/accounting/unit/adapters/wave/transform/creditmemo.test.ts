import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import {
  transformCreditMemo,
  type WaveCreditMemo,
} from '../../../../../../../src/verticals/accounting/adapters/wave/transform/creditmemo'

function makeCreditMemo(overrides: Partial<WaveCreditMemo> = {}): WaveCreditMemo {
  return {
    id: 'cm-001',
    creditNoteNumber: 'CN-2024-001',
    customer: { id: 'cust-1' },
    currency: { code: 'CAD' },
    totalAmount: 500,
    amountDue: 500,
    amountPaid: 0,
    invoiceDate: '2024-03-15',
    status: 'SENT',
    createdAt: '2024-03-15T10:00:00Z',
    modifiedAt: '2024-03-15T10:00:00Z',
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps id from raw id', () => {
    expect(transformCreditMemo(makeCreditMemo()).id).toBe('cm-001')
  })

  it('maps creditNoteNumber to creditmemoNumber', () => {
    expect(transformCreditMemo(makeCreditMemo()).creditmemoNumber).toBe('CN-2024-001')
  })

  it('maps customer.id to contactId', () => {
    expect(transformCreditMemo(makeCreditMemo()).contactId).toBe('cust-1')
  })

  it('maps currency.code to currency', () => {
    expect(transformCreditMemo(makeCreditMemo()).currency).toBe('CAD')
  })

  it('maps totalAmount', () => {
    expect(transformCreditMemo(makeCreditMemo()).totalAmount).toBe(500)
  })

  it('maps amountDue to balanceAmount', () => {
    expect(transformCreditMemo(makeCreditMemo()).balanceAmount).toBe(500)
  })

  it('maps status SENT to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'SENT' })).status).toBe('AUTHORIZED')
  })

  it('maps status DRAFT to DRAFT', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'DRAFT' })).status).toBe('DRAFT')
  })

  it('maps status PAID to PAID', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'PAID' })).status).toBe('PAID')
  })

  it('maps status PARTIAL to PARTIALLY_PAID', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'PARTIAL' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps status VOIDED to VOIDED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'VOIDED' })).status).toBe('VOIDED')
  })

  it('returns undefined contactId when customer is null', () => {
    expect(transformCreditMemo(makeCreditMemo({ customer: null })).contactId).toBeUndefined()
  })

  it('returns undefined creditmemoNumber when creditNoteNumber is empty', () => {
    expect(
      transformCreditMemo(makeCreditMemo({ creditNoteNumber: '' })).creditmemoNumber,
    ).toBeUndefined()
  })

  it('maps invoiceDate to postedAt', () => {
    expect(transformCreditMemo(makeCreditMemo()).postedAt).toEqual(new Date('2024-03-15'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeCreditMemo()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
