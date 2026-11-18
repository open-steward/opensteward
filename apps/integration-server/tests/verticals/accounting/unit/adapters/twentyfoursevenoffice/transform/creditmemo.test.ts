import { describe, it, expect } from 'vitest'
import { expectDate } from '../../../../../../date-assertions'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import {
  transformCreditMemo,
  type TwentyFourSevenCreditMemo,
} from '../../../../../../../src/verticals/accounting/adapters/twentyfoursevenoffice/transform/creditmemo'

function makeCreditMemo(overrides: Partial<TwentyFourSevenCreditMemo> = {}): TwentyFourSevenCreditMemo {
  return {
    id: 'cm-001',
    creditNoteNumber: 3001,
    customerId: 'cust-7',
    currency: 'NOK',
    issueDate: '2024-03-01',
    dueDate: '2024-03-31',
    status: 'approved',
    totalAmount: -10000,
    taxAmount: -2000,
    balance: -10000,
    paidAmount: 0,
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps id from raw id', () => {
    expect(transformCreditMemo(makeCreditMemo()).id).toBe('cm-001')
  })

  it('maps creditNoteNumber to creditmemoNumber as string', () => {
    expect(transformCreditMemo(makeCreditMemo()).creditmemoNumber).toBe('3001')
  })

  it('maps customerId to contactId', () => {
    expect(transformCreditMemo(makeCreditMemo()).contactId).toBe('cust-7')
  })

  it('maps currency', () => {
    expect(transformCreditMemo(makeCreditMemo()).currency).toBe('NOK')
  })

  it('maps amounts correctly', () => {
    const cm = transformCreditMemo(makeCreditMemo())
    expect(cm.totalAmount).toBe(-10000)
    expect(cm.taxAmount).toBe(-2000)
    expect(cm.balanceAmount).toBe(-10000)
  })

  it('maps issueDate to postedAt as Date', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(expectDate(result.postedAt).toISOString().startsWith('2024-03-01')).toBe(true)
  })

  it('maps dueDate to dueAt as Date', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.dueAt).toBeInstanceOf(Date)
    expect(expectDate(result.dueAt).toISOString().startsWith('2024-03-31')).toBe(true)
  })

  it('maps status DRAFT when status is draft', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps status AUTHORIZED when approved with outstanding balance', () => {
    expect(
      transformCreditMemo(makeCreditMemo({ status: 'approved', balance: -10000, paidAmount: 0 })).status,
    ).toBe('AUTHORIZED')
  })

  it('maps status PAID when approved and balance is zero', () => {
    expect(
      transformCreditMemo(makeCreditMemo({ status: 'approved', balance: 0 })).status,
    ).toBe('PAID')
  })

  it('maps status PARTIALLY_PAID when approved with partial payment', () => {
    expect(
      transformCreditMemo(makeCreditMemo({ status: 'approved', balance: -5000, paidAmount: 5000 })).status,
    ).toBe('PARTIALLY_PAID')
  })

  it('maps status VOIDED when status is voided', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'voided' })).status).toBe('VOIDED')
  })

  it('maps status VOIDED when status is cancelled', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'cancelled' })).status).toBe('VOIDED')
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
