import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type PagaStubBill } from '../../../../../../../src/verticals/accounting/adapters/paga/transform/bill'

function makeRaw(overrides: Partial<PagaStubBill> = {}): PagaStubBill {
  return { ...overrides }
}

describe('paga transformBill', () => {
  it('handles missing optional fields gracefully', () => {
    expect(() => transformBill(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeRaw())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
