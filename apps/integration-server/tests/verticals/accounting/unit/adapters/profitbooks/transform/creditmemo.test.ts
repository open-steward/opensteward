import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import {
  transformCreditMemo,
  type ProfitBooksCreditMemo,
} from '../../../../../../../src/verticals/accounting/adapters/profitbooks/transform/creditmemo'

function makeCreditMemo(overrides: Partial<ProfitBooksCreditMemo> = {}): ProfitBooksCreditMemo {
  return {
    id: 'cm-001',
    credit_note_number: 'CN-2024-001',
    contact_id: 'contact-7',
    currency: 'USD',
    total_amount: 968,
    tax_amount: 168,
    paid_amount: 0,
    balance_amount: 968,
    date: '2024-03-01',
    due_date: '2024-04-01',
    status: 'approved',
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps id from raw id', () => {
    expect(transformCreditMemo(makeCreditMemo()).id).toBe('cm-001')
  })

  it('maps credit_note_number to creditmemoNumber', () => {
    expect(transformCreditMemo(makeCreditMemo()).creditmemoNumber).toBe('CN-2024-001')
  })

  it('maps contact_id to contactId', () => {
    expect(transformCreditMemo(makeCreditMemo()).contactId).toBe('contact-7')
  })

  it('maps currency', () => {
    expect(transformCreditMemo(makeCreditMemo()).currency).toBe('USD')
  })

  it('maps amounts correctly', () => {
    const cm = transformCreditMemo(makeCreditMemo())
    expect(cm.totalAmount).toBe(968)
    expect(cm.taxAmount).toBe(168)
    expect(cm.balanceAmount).toBe(968)
  })

  it('maps date (ISO string) to postedAt as Date', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
  })

  it('maps due_date (ISO string) to dueAt as Date', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.dueAt).toBeInstanceOf(Date)
    expect(result.dueAt).toEqual(new Date('2024-04-01'))
  })

  it('maps status draft to DRAFT', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps status approved to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'approved' })).status).toBe('AUTHORIZED')
  })

  it('maps status paid to PAID', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps status partially_paid to PARTIALLY_PAID', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'partially_paid' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps status cancelled to VOIDED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'cancelled' })).status).toBe('VOIDED')
  })

  it('maps status overdue to AUTHORIZED (no OVERDUE in CreditMemo)', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'overdue' })).status).toBe('AUTHORIZED')
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
