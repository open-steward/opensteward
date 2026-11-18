import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type FattureCloudCreditNote } from '../../../../../../../src/verticals/accounting/adapters/fatturecloud/transform/creditmemo'

function makeCM(overrides: Partial<FattureCloudCreditNote> = {}): FattureCloudCreditNote {
  return { id: 60, number: 'NC-001', entity: { id: 5 }, date: '2024-07-01', currency: { id: 'EUR' }, totals: { amount: -500, vat_amount: -91 }, status: { id: 'not_paid' }, ...overrides }
}

describe('transformCreditMemo (fatturecloud)', () => {
  it('maps id and creditmemoNumber', () => {
    expect(transformCreditMemo(makeCM()).id).toBe('60')
    expect(transformCreditMemo(makeCM()).creditmemoNumber).toBe('NC-001')
  })
  it('draft → DRAFT', () => { expect(transformCreditMemo(makeCM({ status: { id: 'draft' } })).status).toBe('DRAFT') })
  it('paid → PAID', () => { expect(transformCreditMemo(makeCM({ status: { id: 'paid' } })).status).toBe('PAID') })
  it('maps totalAmount', () => { expect(transformCreditMemo(makeCM()).totalAmount).toBe(-500) })
  it('passes raw as metadata', () => {
    const raw = makeCM()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeCM())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
