import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type PagaStubCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/paga/transform/creditmemo'

function makeRaw(overrides: Partial<PagaStubCreditMemo> = {}): PagaStubCreditMemo {
  return { ...overrides }
}

describe('paga transformCreditMemo', () => {
  it('handles missing optional fields gracefully', () => {
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
