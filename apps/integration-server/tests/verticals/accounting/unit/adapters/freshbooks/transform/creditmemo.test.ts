import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import {
  transformCreditMemo,
  type FreshBooksCreditNote,
} from '../../../../../../../src/verticals/accounting/adapters/freshbooks/transform/creditmemo'

function makeCreditNote(overrides: Partial<FreshBooksCreditNote> = {}): FreshBooksCreditNote {
  return {
    id: 88,
    client_id: 55,
    credit_number: 'CN-2024-001',
    date: '2024-03-15',
    currency_code: 'USD',
    amount: { amount: '250.00', code: 'USD' },
    balance: { amount: '250.00', code: 'USD' },
    status: 4,
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps id correctly (number to string)', () => {
    expect(transformCreditMemo(makeCreditNote()).id).toBe('88')
  })

  it('maps credit_number to creditmemoNumber', () => {
    expect(transformCreditMemo(makeCreditNote()).creditmemoNumber).toBe('CN-2024-001')
  })

  it('maps client_id to contactId', () => {
    expect(transformCreditMemo(makeCreditNote()).contactId).toBe('55')
  })

  it('maps currency_code to currency', () => {
    expect(transformCreditMemo(makeCreditNote()).currency).toBe('USD')
  })

  it('parses amount to totalAmount', () => {
    expect(transformCreditMemo(makeCreditNote()).totalAmount).toBe(250)
  })

  it('parses balance to balanceAmount', () => {
    expect(transformCreditMemo(makeCreditNote()).balanceAmount).toBe(250)
  })

  it('parses date as Date object for postedAt', () => {
    expect(transformCreditMemo(makeCreditNote()).postedAt).toEqual(new Date('2024-03-15'))
  })

  it('maps status 1 to DRAFT', () => {
    expect(transformCreditMemo(makeCreditNote({ status: 1 })).status).toBe('DRAFT')
  })

  it('maps status 4 to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditNote({ status: 4 })).status).toBe('AUTHORIZED')
  })

  it('maps status 10 to PAID', () => {
    expect(transformCreditMemo(makeCreditNote({ status: 10 })).status).toBe('PAID')
  })

  it('maps status 12 to VOIDED', () => {
    expect(transformCreditMemo(makeCreditNote({ status: 12 })).status).toBe('VOIDED')
  })

  it('maps unknown status to DRAFT', () => {
    expect(transformCreditMemo(makeCreditNote({ status: 99 })).status).toBe('DRAFT')
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
