import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type EBoekhoudenCreditNote } from '../../../../../../../src/verticals/accounting/adapters/eboekhouden/transform/creditmemo'

function makeCreditNote(overrides: Partial<EBoekhoudenCreditNote> = {}): EBoekhoudenCreditNote {
  return {
    id: 400,
    invoiceNumber: 'CN-001',
    relationId: 42,
    totalInclTax: -1210,
    taxAmount: -210,
    isPaid: false,
    isCancelled: false,
    date: '2024-04-01',
    currency: 'EUR',
    ...overrides,
  }
}

describe('transformCreditMemo (eboekhouden)', () => {
  it('maps id and creditmemoNumber', () => {
    const result = transformCreditMemo(makeCreditNote())
    expect(result.id).toBe('400')
    expect(result.creditmemoNumber).toBe('CN-001')
  })

  it('not paid → AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditNote({ isPaid: false })).status).toBe('AUTHORIZED')
  })

  it('isPaid → PAID', () => {
    expect(transformCreditMemo(makeCreditNote({ isPaid: true })).status).toBe('PAID')
  })

  it('isCancelled → VOIDED', () => {
    expect(transformCreditMemo(makeCreditNote({ isCancelled: true })).status).toBe('VOIDED')
  })

  it('maps totalAmount', () => {
    expect(transformCreditMemo(makeCreditNote()).totalAmount).toBe(-1210)
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
