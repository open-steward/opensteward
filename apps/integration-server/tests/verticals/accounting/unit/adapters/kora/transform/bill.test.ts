import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type KoraStubBill } from '../../../../../../../src/verticals/accounting/adapters/kora/transform/bill'

function makeRaw(overrides: KoraStubBill = {}): KoraStubBill {
  return { ...overrides }
}

describe('kora transformBill', () => {
  it('handles empty object gracefully', () => {
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
