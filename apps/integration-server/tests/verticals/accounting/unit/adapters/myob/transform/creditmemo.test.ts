import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type MyobCreditNote } from '../../../../../../../src/verticals/accounting/adapters/myob/transform/creditmemo'

function makeCM(overrides: Partial<MyobCreditNote> = {}): MyobCreditNote {
  return { UID: 'uid-9', Number: 'CN-001', Customer: { UID: 'cust-1' }, Date: '2024-07-01', TotalAmount: -500, Status: 'Open', ...overrides }
}

describe('transformCreditMemo (myob)', () => {
  it('maps id and creditmemoNumber', () => {
    expect(transformCreditMemo(makeCM()).id).toBe('uid-9')
    expect(transformCreditMemo(makeCM()).creditmemoNumber).toBe('CN-001')
  })
  it('Open → AUTHORIZED', () => { expect(transformCreditMemo(makeCM()).status).toBe('AUTHORIZED') })
  it('Closed → PAID', () => { expect(transformCreditMemo(makeCM({ Status: 'Closed' })).status).toBe('PAID') })
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
