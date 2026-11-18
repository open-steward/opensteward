import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type KwaraSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/kwara/transform/salesorder'

function makeRaw(overrides: Partial<KwaraSalesOrder> = {}): KwaraSalesOrder {
  return { id: 'so-001', ...overrides }
}

describe('transformSalesOrder (Kwara)', () => {
  it('maps core fields correctly', () => {
    const r = transformSalesOrder(makeRaw())
    expect(r.id).toBe('so-001')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeRaw())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
