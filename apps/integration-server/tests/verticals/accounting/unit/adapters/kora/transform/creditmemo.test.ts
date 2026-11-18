import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type KoraStubCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/kora/transform/creditmemo'

function makeRaw(overrides: KoraStubCreditMemo = {}): KoraStubCreditMemo {
  return { ...overrides }
}

describe('kora transformCreditMemo', () => {
  it('handles empty object gracefully', () => {
    expect(() => transformCreditMemo(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeRaw())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
