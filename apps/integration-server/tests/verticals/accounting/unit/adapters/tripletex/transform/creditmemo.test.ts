import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import {
  transformCreditMemo,
  type TripletexCreditNote,
} from '../../../../../../../src/verticals/accounting/adapters/tripletex/transform/creditmemo'

function makeCreditNote(overrides: Partial<TripletexCreditNote> = {}): TripletexCreditNote {
  return {
    id: 202,
    invoiceNumber: 20240015,
    customer: { id: 77, name: 'Bergström AS' },
    invoiceDate: '2024-04-01',
    invoiceDueDate: '2024-04-30',
    amountCurrency: 1200,
    currency: { id: '1', code: 'NOK' },
    isCreditNote: true,
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps id correctly', () => {
    expect(transformCreditMemo(makeCreditNote()).id).toBe('202')
  })

  it('maps invoiceNumber to creditmemoNumber as string', () => {
    expect(transformCreditMemo(makeCreditNote()).creditmemoNumber).toBe('20240015')
  })

  it('maps customer id to contactId', () => {
    expect(transformCreditMemo(makeCreditNote()).contactId).toBe('77')
  })

  it('maps currency code correctly', () => {
    expect(transformCreditMemo(makeCreditNote()).currency).toBe('NOK')
  })

  it('maps amountCurrency to totalAmount', () => {
    expect(transformCreditMemo(makeCreditNote()).totalAmount).toBe(1200)
  })

  it('always sets status to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditNote()).status).toBe('AUTHORIZED')
  })

  it('parses invoiceDate as postedAt Date object', () => {
    expect(transformCreditMemo(makeCreditNote()).postedAt).toEqual(new Date('2024-04-01'))
  })

  it('parses invoiceDueDate as dueAt Date object', () => {
    expect(transformCreditMemo(makeCreditNote()).dueAt).toEqual(new Date('2024-04-30'))
  })

  it('sets contactId to undefined when customer is absent', () => {
    expect(transformCreditMemo(makeCreditNote({ customer: undefined })).contactId).toBeUndefined()
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
