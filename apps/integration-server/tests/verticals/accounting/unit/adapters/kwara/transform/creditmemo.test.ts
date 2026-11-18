import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type KwaraCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/kwara/transform/creditmemo'

function makeRaw(overrides: Partial<KwaraCreditMemo> = {}): KwaraCreditMemo {
  return { id: 'cm-001', ...overrides }
}

describe('transformCreditMemo (Kwara)', () => {
  it('maps core fields correctly', () => {
    const r = transformCreditMemo(makeRaw())
    expect(r.id).toBe('cm-001')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeRaw())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
