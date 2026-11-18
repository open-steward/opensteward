import { describe, it, expect } from 'vitest'
import { expectDate } from '../../../../../../date-assertions'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import {
  transformCreditMemo,
  type BillomatCreditMemo,
} from '../../../../../../../src/verticals/accounting/adapters/billomat/transform/creditmemo'

function makeCreditMemo(overrides: Partial<BillomatCreditMemo> = {}): BillomatCreditMemo {
  return {
    id: 'cm-001',
    credit_note_number: 'GS-3001',
    client_id: 'client-7',
    currency_code: 'EUR',
    date: '2024-03-01',
    due_date: '2024-03-31',
    status: 'OPEN',
    total_gross: -11900,
    total_net: -10000,
    tax_amount: -1900,
    paid_amount: 0,
    open_amount: -11900,
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps id from raw id', () => {
    expect(transformCreditMemo(makeCreditMemo()).id).toBe('cm-001')
  })

  it('maps credit_note_number to creditmemoNumber', () => {
    expect(transformCreditMemo(makeCreditMemo()).creditmemoNumber).toBe('GS-3001')
  })

  it('maps client_id to contactId', () => {
    expect(transformCreditMemo(makeCreditMemo()).contactId).toBe('client-7')
  })

  it('maps currency_code to currency', () => {
    expect(transformCreditMemo(makeCreditMemo()).currency).toBe('EUR')
  })

  it('maps amounts correctly', () => {
    const cm = transformCreditMemo(makeCreditMemo())
    expect(cm.totalAmount).toBe(-11900)
    expect(cm.taxAmount).toBe(-1900)
    expect(cm.balanceAmount).toBe(-11900)
  })

  it('maps date to postedAt as Date', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(expectDate(result.postedAt).toISOString().startsWith('2024-03-01')).toBe(true)
  })

  it('maps due_date to dueAt as Date', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.dueAt).toBeInstanceOf(Date)
    expect(expectDate(result.dueAt).toISOString().startsWith('2024-03-31')).toBe(true)
  })

  it('maps status DRAFT when status is DRAFT', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'DRAFT' })).status).toBe('DRAFT')
  })

  it('maps status AUTHORIZED when OPEN with no payment', () => {
    expect(
      transformCreditMemo(makeCreditMemo({ status: 'OPEN', paid_amount: 0 })).status,
    ).toBe('AUTHORIZED')
  })

  it('maps status PAID when status is PAID', () => {
    expect(
      transformCreditMemo(makeCreditMemo({ status: 'PAID' })).status,
    ).toBe('PAID')
  })

  it('maps status PARTIALLY_PAID when OPEN with partial payment', () => {
    expect(
      transformCreditMemo(makeCreditMemo({ status: 'OPEN', paid_amount: 5000, open_amount: -6900 })).status,
    ).toBe('PARTIALLY_PAID')
  })

  it('maps status VOIDED when CANCELED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'CANCELED' })).status).toBe('VOIDED')
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
