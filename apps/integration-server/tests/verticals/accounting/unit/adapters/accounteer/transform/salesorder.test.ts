import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type AccounteerSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/accounteer/transform/salesorder'

function makeRaw(overrides: Partial<AccounteerSalesOrder> = {}): AccounteerSalesOrder {
  return { id: '1', ...overrides }
}

describe('accounteer transformSalesOrder', () => {
  it('maps id', () => {
    expect(transformSalesOrder(makeRaw()).id).toBe('1')
  })
  it('handles missing optional fields gracefully', () => {
    expect(() => transformSalesOrder(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })
  it('maps status confirmed -> ACTIVE', () => {
    expect(transformSalesOrder(makeRaw({ status: 'confirmed' })).status).toBe('ACTIVE')
  })
  it('maps status completed -> COMPLETED', () => {
    expect(transformSalesOrder(makeRaw({ status: 'completed' })).status).toBe('COMPLETED')
  })
  it('maps date to postedAt as Date', () => {
    const result = transformSalesOrder(makeRaw({ date: '2024-08-01' }))
    expect(result.postedAt).toEqual(new Date('2024-08-01'))
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeRaw())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
