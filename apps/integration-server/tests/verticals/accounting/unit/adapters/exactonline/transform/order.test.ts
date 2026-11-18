import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type ExactOrder } from '../../../../../../../src/verticals/accounting/adapters/exactonline/transform/order'

function makeOrder(overrides: Partial<ExactOrder> = {}): ExactOrder {
  return { OrderID: 'ord-1', OrderedBy: 'cust-1', AmountDC: 2000, Currency: 'EUR', Status: 20, OrderDate: '2024-08-01', ...overrides }
}

describe('transformOrder (exactonline)', () => {
  it('maps id and type=SALES', () => {
    const r = transformOrder(makeOrder())
    expect(r.id).toBe('ord-1')
    expect(r.type).toBe('SALES')
  })
  it('Status 12 → DRAFT', () => {
    expect(transformOrder(makeOrder({ Status: 12 })).status).toBe('DRAFT')
  })
  it('Status 20 → ACTIVE', () => {
    expect(transformOrder(makeOrder({ Status: 20 })).status).toBe('ACTIVE')
  })
  it('Status 45 → COMPLETED', () => {
    expect(transformOrder(makeOrder({ Status: 45 })).status).toBe('COMPLETED')
  })
  it('Status 46 → CANCELLED', () => {
    expect(transformOrder(makeOrder({ Status: 46 })).status).toBe('CANCELLED')
  })
  it('passes raw as metadata', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
