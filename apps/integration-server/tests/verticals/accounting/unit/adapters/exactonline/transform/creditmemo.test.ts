import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type ExactCreditNote } from '../../../../../../../src/verticals/accounting/adapters/exactonline/transform/creditmemo'

function makeCM(overrides: Partial<ExactCreditNote> = {}): ExactCreditNote {
  return { EntryID: 'cm-1', InvoiceNumber: 'CN-001', Customer: 'c-guid', AmountDC: 500, VATAmountDC: 80, Status: 20, EntryDate: '2024-07-01', ...overrides }
}

describe('transformCreditMemo (exactonline)', () => {
  it('maps id and creditmemoNumber', () => {
    const r = transformCreditMemo(makeCM())
    expect(r.id).toBe('cm-1')
    expect(r.creditmemoNumber).toBe('CN-001')
  })
  it('Status 10 → DRAFT', () => {
    expect(transformCreditMemo(makeCM({ Status: 10 })).status).toBe('DRAFT')
  })
  it('Status 20 → AUTHORIZED', () => {
    expect(transformCreditMemo(makeCM({ Status: 20 })).status).toBe('AUTHORIZED')
  })
  it('Status 50 → PAID', () => {
    expect(transformCreditMemo(makeCM({ Status: 50 })).status).toBe('PAID')
  })
  it('maps totalAmount', () => {
    expect(transformCreditMemo(makeCM()).totalAmount).toBe(500)
  })
  it('passes raw as metadata', () => {
    const raw = makeCM()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeCM())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
