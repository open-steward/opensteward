import { describe, it, expect } from 'vitest'
import {
  transformCreditMemo,
  type ManagerCreditNote,
} from '../../../../../../../src/verticals/accounting/adapters/manager/transform/creditmemo'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'

function makeCreditNote(overrides: Partial<ManagerCreditNote> = {}): ManagerCreditNote {
  return {
    key: 'cn-key-1',
    issueDate: '2024-06-01',
    dueDate: '2024-07-01',
    reference: 'CN-2024-001',
    customer: 'cust-uuid',
    description: 'Credit for returned goods',
    creditNoteAmount: { value: 120.0, currency: 'USD' },
    balanceDue: { value: 120.0, currency: 'USD' },
    status: 'Unpaid',
    lines: [],
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps key to id', () => {
    expect(transformCreditMemo(makeCreditNote()).id).toBe('cn-key-1')
  })

  it('maps reference to creditmemoNumber, falls back to key', () => {
    expect(transformCreditMemo(makeCreditNote()).creditmemoNumber).toBe('CN-2024-001')
    expect(transformCreditMemo(makeCreditNote({ reference: undefined })).creditmemoNumber).toBe(
      'cn-key-1',
    )
  })

  it('maps customer to contactId', () => {
    expect(transformCreditMemo(makeCreditNote()).contactId).toBe('cust-uuid')
  })

  it('converts creditNoteAmount to minor units', () => {
    // 120.0 → 12000
    expect(transformCreditMemo(makeCreditNote()).totalAmount).toBe(12000)
  })

  it('maps status Unpaid to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditNote({ status: 'Unpaid' })).status).toBe('AUTHORIZED')
  })

  it('maps status PaidInFull to PAID', () => {
    expect(transformCreditMemo(makeCreditNote({ status: 'PaidInFull' })).status).toBe('PAID')
  })

  it('maps status PartiallyPaid to PARTIALLY_PAID', () => {
    expect(transformCreditMemo(makeCreditNote({ status: 'PartiallyPaid' })).status).toBe(
      'PARTIALLY_PAID',
    )
  })

  it('maps status Void to VOIDED', () => {
    expect(transformCreditMemo(makeCreditNote({ status: 'Void' })).status).toBe('VOIDED')
  })

  it('computes paidAmount as totalAmount - balanceAmount', () => {
    const result = transformCreditMemo(
      makeCreditNote({
        creditNoteAmount: { value: 120.0, currency: 'USD' },
        balanceDue: { value: 40.0, currency: 'USD' },
        status: 'PartiallyPaid',
      }),
    )
    expect(result.paidAmount).toBe(8000)
  })

  it('parses issueDate as postedAt', () => {
    expect(transformCreditMemo(makeCreditNote()).postedAt).toEqual(new Date('2024-06-01'))
  })

  it('maps lines to lineItems using salesUnitPrice', () => {
    const result = transformCreditMemo(
      makeCreditNote({
        lines: [
          {
            account: 'acct-1',
            lineDescription: 'Returned widget',
            qty: 3,
            salesUnitPrice: 40.0,
            amount: { value: 120.0, currency: 'USD' },
          },
        ],
      }),
    )
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].unitAmount).toBe(4000)
    expect(result.lineItems![0].totalAmount).toBe(12000)
  })

  it('passes schema validation', () => {
    expect(() => CreditMemoSchema.parse(transformCreditMemo(makeCreditNote()))).not.toThrow()
  })
})
