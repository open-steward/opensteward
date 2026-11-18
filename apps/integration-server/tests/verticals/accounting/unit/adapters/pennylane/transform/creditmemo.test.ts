import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import {
  transformCreditMemo,
  type PennylaneCreditNote,
} from '../../../../../../../src/verticals/accounting/adapters/pennylane/transform/creditmemo'

function makeCreditMemo(overrides: Partial<PennylaneCreditNote> = {}): PennylaneCreditNote {
  return {
    id: 'cm-1',
    invoice_number: 'CN-2024-001',
    customer: { source_id: 'cust-1' },
    date: '2024-04-01',
    currency: 'EUR',
    amount: 250,
    remaining_amount: 250,
    status: 'sent',
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps id correctly', () => {
    expect(transformCreditMemo(makeCreditMemo()).id).toBe('cm-1')
  })

  it('maps invoice_number to creditmemoNumber', () => {
    expect(transformCreditMemo(makeCreditMemo()).creditmemoNumber).toBe('CN-2024-001')
  })

  it('maps customer source_id to contactId', () => {
    expect(transformCreditMemo(makeCreditMemo()).contactId).toBe('cust-1')
  })

  it('returns undefined contactId when customer is null', () => {
    expect(transformCreditMemo(makeCreditMemo({ customer: null })).contactId).toBeUndefined()
  })

  it('maps currency correctly', () => {
    expect(transformCreditMemo(makeCreditMemo()).currency).toBe('EUR')
  })

  it('maps amount to totalAmount', () => {
    expect(transformCreditMemo(makeCreditMemo()).totalAmount).toBe(250)
  })

  it('maps remaining_amount to balanceAmount', () => {
    expect(transformCreditMemo(makeCreditMemo()).balanceAmount).toBe(250)
  })

  it('parses date as Date object', () => {
    expect(transformCreditMemo(makeCreditMemo()).postedAt).toEqual(new Date('2024-04-01'))
  })

  it('maps status draft to DRAFT', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps status not_sent to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'not_sent' })).status).toBe('AUTHORIZED')
  })

  it('maps status sent to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'sent' })).status).toBe('AUTHORIZED')
  })

  it('maps status received to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'received' })).status).toBe('AUTHORIZED')
  })

  it('maps status partially_paid to PARTIALLY_PAID', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'partially_paid' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps status paid to PAID', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps status cancelled to VOIDED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'cancelled' })).status).toBe('VOIDED')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeCreditMemo()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
