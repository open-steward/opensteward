import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type KwaraBill } from '../../../../../../../src/verticals/accounting/adapters/kwara/transform/bill'

function makeRaw(overrides: Partial<KwaraBill> = {}): KwaraBill {
  return { id: 'bill-001', ...overrides }
}

describe('transformBill (Kwara)', () => {
  it('maps core fields correctly', () => {
    const r = transformBill(makeRaw())
    expect(r.id).toBe('bill-001')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeRaw())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
