import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type EconomicCreditNote } from '../../../../../../../src/verticals/accounting/adapters/economic/transform/creditmemo'

function makeRaw(overrides: Partial<EconomicCreditNote> = {}): EconomicCreditNote {
  return {
    bookedInvoiceNumber: 100,
    draftInvoiceNumber: 0,
    date: '2024-03-01',
    dueDate: '2024-04-01',
    currency: 'DKK',
    grossAmount: -500,
    vatAmount: -125,
    remainder: 500,
    customer: { customerNumber: 1, name: 'Customer A' },
    ...overrides,
  }
}

describe('economic transformCreditMemo', () => {
  it('maps bookedInvoiceNumber to id', () => {
    expect(transformCreditMemo(makeRaw()).id).toBe('100')
  })
  it('handles fields gracefully', () => {
    expect(() => transformCreditMemo(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })
  it('maps booked + remainder=0 -> PAID', () => {
    expect(transformCreditMemo(makeRaw({ bookedInvoiceNumber: 100, remainder: 0 })).status).toBe('PAID')
  })
  it('maps draft (no bookedInvoiceNumber) -> DRAFT', () => {
    expect(transformCreditMemo(makeRaw({ bookedInvoiceNumber: 0, draftInvoiceNumber: 99 })).status).toBe('DRAFT')
  })
  it('maps date to postedAt as Date', () => {
    expect(transformCreditMemo(makeRaw()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeRaw())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
