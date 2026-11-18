import { describe, it, expect } from 'vitest'
import { expectDate } from '../../../../../../date-assertions'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import {
  transformCreditMemo,
  type AkauntingCreditMemo,
} from '../../../../../../../src/verticals/accounting/adapters/akaunting/transform/creditmemo'

function makeCreditMemo(overrides: Partial<AkauntingCreditMemo> = {}): AkauntingCreditMemo {
  return {
    id: 801,
    document_number: 'CN-001',
    contact_id: 42,
    currency_code: 'EUR',
    issued_at: '2024-03-01',
    due_at: '2024-03-31',
    status: 'sent',
    amount: -10000,
    tax_total: -2000,
    paid: 0,
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps id from raw id as string', () => {
    expect(transformCreditMemo(makeCreditMemo()).id).toBe('801')
  })

  it('maps document_number to creditmemoNumber', () => {
    expect(transformCreditMemo(makeCreditMemo()).creditmemoNumber).toBe('CN-001')
  })

  it('maps contact_id to contactId as string', () => {
    expect(transformCreditMemo(makeCreditMemo()).contactId).toBe('42')
  })

  it('maps currency_code to currency', () => {
    expect(transformCreditMemo(makeCreditMemo()).currency).toBe('EUR')
  })

  it('maps amounts correctly', () => {
    const cm = transformCreditMemo(makeCreditMemo())
    expect(cm.totalAmount).toBe(-10000)
    expect(cm.taxAmount).toBe(-2000)
    expect(cm.balanceAmount).toBe(-10000)
  })

  it('maps issued_at to postedAt as Date', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(expectDate(result.postedAt).toISOString().startsWith('2024-03-01')).toBe(true)
  })

  it('maps due_at to dueAt as Date', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.dueAt).toBeInstanceOf(Date)
    expect(expectDate(result.dueAt).toISOString().startsWith('2024-03-31')).toBe(true)
  })

  it('maps status draft to DRAFT', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps status sent to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'sent' })).status).toBe('AUTHORIZED')
  })

  it('maps status paid to PAID', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps status partial to PARTIALLY_PAID', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'partial' })).status).toBe(
      'PARTIALLY_PAID',
    )
  })

  it('maps status cancelled to VOIDED', () => {
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
