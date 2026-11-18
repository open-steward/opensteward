import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type FattureCloudOrder } from '../../../../../../../src/verticals/accounting/adapters/fatturecloud/transform/order'

function makeOrder(overrides: Partial<FattureCloudOrder> = {}): FattureCloudOrder {
  return { id: 70, number: 'ORD-001', entity: { id: 5 }, date: '2024-08-01', currency: { id: 'EUR' }, totals: { amount: 2000 }, status: { id: 'accepted' }, ...overrides }
}

describe('transformOrder (fatturecloud)', () => {
  it('maps id and type=SALES', () => {
    expect(transformOrder(makeOrder()).id).toBe('70')
    expect(transformOrder(makeOrder()).type).toBe('SALES')
  })
  it('draft → DRAFT', () => { expect(transformOrder(makeOrder({ status: { id: 'draft' } })).status).toBe('DRAFT') })
  it('accepted → ACTIVE', () => { expect(transformOrder(makeOrder({ status: { id: 'accepted' } })).status).toBe('ACTIVE') })
  it('invoiced → COMPLETED', () => { expect(transformOrder(makeOrder({ status: { id: 'invoiced' } })).status).toBe('COMPLETED') })
  it('cancelled → CANCELLED', () => { expect(transformOrder(makeOrder({ status: { id: 'cancelled' } })).status).toBe('CANCELLED') })
  it('passes raw as metadata', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
