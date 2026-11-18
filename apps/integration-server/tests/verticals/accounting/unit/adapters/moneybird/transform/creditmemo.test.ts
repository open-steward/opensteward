import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type MoneybirdCreditNote } from '../../../../../../../src/verticals/accounting/adapters/moneybird/transform/creditmemo'

function makeCM(overrides: Partial<MoneybirdCreditNote> = {}): MoneybirdCreditNote {
  return { id: 900, reference: 'CN-001', contact_id: 200, total_price_incl_tax: '-500', currency: 'EUR', state: 'open', date: '2024-07-01', ...overrides }
}

describe('transformCreditMemo (moneybird)', () => {
  it('maps id and creditmemoNumber', () => {
    expect(transformCreditMemo(makeCM()).id).toBe('900')
    expect(transformCreditMemo(makeCM()).creditmemoNumber).toBe('CN-001')
  })
  it('draft → DRAFT', () => { expect(transformCreditMemo(makeCM({ state: 'draft' })).status).toBe('DRAFT') })
  it('open → AUTHORIZED', () => { expect(transformCreditMemo(makeCM({ state: 'open' })).status).toBe('AUTHORIZED') })
  it('paid → PAID', () => { expect(transformCreditMemo(makeCM({ state: 'paid' })).status).toBe('PAID') })
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
