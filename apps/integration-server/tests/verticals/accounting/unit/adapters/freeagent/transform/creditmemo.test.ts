import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import {
  transformCreditMemo,
  type FreeAgentCreditNote,
} from '../../../../../../../src/verticals/accounting/adapters/freeagent/transform/creditmemo'

function makeCreditNote(overrides: Partial<FreeAgentCreditNote> = {}): FreeAgentCreditNote {
  return {
    url: 'https://api.freeagent.com/v2/credit_notes/77',
    contact: 'https://api.freeagent.com/v2/contacts/10',
    invoice_number: 'CN-2024-001',
    reference: 'REF-001',
    dated_on: '2024-04-01',
    currency: 'GBP',
    total_value: '500.00',
    paid_value: '0.00',
    due_value: '500.00',
    status: 'Sent',
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('extracts id from url', () => {
    expect(transformCreditMemo(makeCreditNote()).id).toBe('77')
  })

  it('extracts contactId from contact url', () => {
    expect(transformCreditMemo(makeCreditNote()).contactId).toBe('10')
  })

  it('maps invoice_number to creditmemoNumber', () => {
    expect(transformCreditMemo(makeCreditNote()).creditmemoNumber).toBe('CN-2024-001')
  })

  it('maps currency correctly', () => {
    expect(transformCreditMemo(makeCreditNote()).currency).toBe('GBP')
  })

  it('parses totalAmount from total_value', () => {
    expect(transformCreditMemo(makeCreditNote()).totalAmount).toBe(500)
  })

  it('parses balanceAmount from due_value', () => {
    expect(transformCreditMemo(makeCreditNote()).balanceAmount).toBe(500)
  })

  it('parses paidAmount from paid_value', () => {
    expect(transformCreditMemo(makeCreditNote()).paidAmount).toBe(0)
  })

  it('parses dated_on as postedAt Date', () => {
    expect(transformCreditMemo(makeCreditNote()).postedAt).toEqual(new Date('2024-04-01'))
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformCreditMemo(makeCreditNote({ status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Sent status to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditNote({ status: 'Sent' })).status).toBe('AUTHORIZED')
  })

  it('maps Paid status to PAID', () => {
    expect(transformCreditMemo(makeCreditNote({ status: 'Paid' })).status).toBe('PAID')
  })

  it('maps Void status to VOIDED', () => {
    expect(transformCreditMemo(makeCreditNote({ status: 'Void' })).status).toBe('VOIDED')
  })

  it('passes raw object as metadata', () => {
    const raw = makeCreditNote()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeCreditNote())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
