import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type NetSuiteCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/netsuite/transform/creditmemo'

function makeCM(overrides: Partial<NetSuiteCreditMemo> = {}): NetSuiteCreditMemo {
  return { id: 800, tranId: 'CM-001', entity: 100, total: -500, currency: 'USD', status: 'Open', tranDate: '2024-07-01', ...overrides }
}

describe('transformCreditMemo (netsuite)', () => {
  it('maps id and creditmemoNumber', () => {
    expect(transformCreditMemo(makeCM()).id).toBe('800')
    expect(transformCreditMemo(makeCM()).creditmemoNumber).toBe('CM-001')
  })
  it('Open → AUTHORIZED', () => { expect(transformCreditMemo(makeCM({ status: 'Open' })).status).toBe('AUTHORIZED') })
  it('Fully Applied → PAID', () => { expect(transformCreditMemo(makeCM({ status: 'Fully Applied' })).status).toBe('PAID') })
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
