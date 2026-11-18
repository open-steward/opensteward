import { describe, it, expect } from 'vitest'
import {
  transformCreditMemo,
  type APCreditNote,
  type APCreditNoteLine,
} from '../../../../../../../src/verticals/accounting/adapters/accountsportal/transform/creditmemo'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'

function makeAPCreditNoteLine(overrides: Partial<APCreditNoteLine> = {}): APCreditNoteLine {
  return {
    id: 1,
    account_id: 4000,
    description: 'Credit for returned goods',
    quantity: 1,
    unit_price: 100.0,
    net_amount: 100.0,
    tax_rate_id: 5,
    tax_amount: 20.0,
    total_amount: 120.0,
    ...overrides,
  }
}

function makeAPCreditNote(overrides: Partial<APCreditNote> = {}): APCreditNote {
  return {
    id: 200,
    credit_note_number: 'CN-200',
    contact_id: 50,
    currency: 'GBP',
    issue_date: '2024-02-10',
    status: 'paid',
    net_amount: 100.0,
    tax_amount: 20.0,
    total_amount: 120.0,
    remaining_credit: 0,
    notes: 'Credit issued',
    credit_note_lines: [makeAPCreditNoteLine()],
    created_at: '2024-02-10T00:00:00.000Z',
    updated_at: '2024-02-15T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformCreditMemo (accountsportal)', () => {
  it('maps id as string', () => {
    expect(transformCreditMemo(makeAPCreditNote({ id: 200 })).id).toBe('200')
  })

  it('maps credit_note_number to creditmemoNumber', () => {
    expect(transformCreditMemo(makeAPCreditNote()).creditmemoNumber).toBe('CN-200')
  })

  it('prefixes contactId with c_', () => {
    expect(transformCreditMemo(makeAPCreditNote({ contact_id: 50 })).contactId).toBe('c_50')
  })

  it('converts total_amount to minor units', () => {
    expect(transformCreditMemo(makeAPCreditNote({ total_amount: 120.0 })).totalAmount).toBe(12000)
  })

  it('converts remaining_credit to minor units as balanceAmount', () => {
    expect(transformCreditMemo(makeAPCreditNote({ remaining_credit: 0 })).balanceAmount).toBe(0)
  })

  it('computes paidAmount as total - remaining in minor units', () => {
    // total=120 → 12000; remaining=40 → 4000; applied=12000-4000=8000
    const result = transformCreditMemo(
      makeAPCreditNote({ total_amount: 120.0, remaining_credit: 40.0 }),
    )
    expect(result.paidAmount).toBe(8000)
  })

  it('maps "paid" status to PAID', () => {
    expect(transformCreditMemo(makeAPCreditNote({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps remaining_credit=0 to PAID regardless of status string', () => {
    expect(
      transformCreditMemo(makeAPCreditNote({ status: 'approved', remaining_credit: 0 })).status,
    ).toBe('PAID')
  })

  it('maps "void" to VOIDED', () => {
    expect(transformCreditMemo(makeAPCreditNote({ status: 'void' })).status).toBe('VOIDED')
  })

  it('maps "part_paid" to PARTIALLY_PAID', () => {
    expect(
      transformCreditMemo(makeAPCreditNote({ status: 'part_paid', remaining_credit: 60.0 })).status,
    ).toBe('PARTIALLY_PAID')
  })

  it('maps "approved" to AUTHORIZED', () => {
    // remaining_credit = 120.0 (full amount) → not paid → falls through to "approved" → AUTHORIZED
    expect(
      transformCreditMemo(makeAPCreditNote({ status: 'approved', remaining_credit: 120.0 })).status,
    ).toBe('AUTHORIZED')
  })

  it('maps notes', () => {
    expect(transformCreditMemo(makeAPCreditNote()).notes).toBe('Credit issued')
  })

  it('maps credit_note_lines with minor-unit conversion', () => {
    const result = transformCreditMemo(makeAPCreditNote())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.unitAmount).toBe(10000) // 100.0 * 100
    expect(li.taxAmount).toBe(2000) // 20.0 * 100
    expect(li.totalAmount).toBe(12000) // 120.0 * 100
  })

  it('maps issue_date to postedAt', () => {
    expect(transformCreditMemo(makeAPCreditNote()).postedAt).toBeInstanceOf(Date)
  })

  it('passes CreditMemoSchema.parse without throwing', () => {
    const result = transformCreditMemo(makeAPCreditNote())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
