import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type MoneyForwardStubBill } from '../../../../../../../src/verticals/accounting/adapters/moneyforward/transform/bill'

describe('transformBill (moneyforward stub)', () => {
  it('returns an object with metadata passthrough', () => {
    const raw: MoneyForwardStubBill = { some_field: 'value' }
    const result = transformBill(raw)
    expect(result.metadata).toBe(raw)
  })

  it('returns object without crashing on empty input', () => {
    const raw: MoneyForwardStubBill = {}
    const result = transformBill(raw)
    expect(result).toBeDefined()
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = { some_field: 'value' }
    const result = transformBill(raw)
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
