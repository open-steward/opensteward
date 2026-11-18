import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type NetSuiteOrder } from '../../../../../../../src/verticals/accounting/adapters/netsuite/transform/order'

function makeOrder(overrides: Partial<NetSuiteOrder> = {}): NetSuiteOrder {
  return { id: 900, tranId: 'SO-001', entity: 100, total: 2000, currency: 'USD', status: 'Pending Billing', tranDate: '2024-08-01', ...overrides }
}

describe('transformOrder (netsuite)', () => {
  it('maps id and type=SALES', () => {
    expect(transformOrder(makeOrder()).id).toBe('900')
    expect(transformOrder(makeOrder()).type).toBe('SALES')
  })
  it('Pending → DRAFT', () => { expect(transformOrder(makeOrder({ status: 'Pending Approval' })).status).toBe('DRAFT') })
  it('Closed → COMPLETED', () => { expect(transformOrder(makeOrder({ status: 'Closed' })).status).toBe('COMPLETED') })
  it('Cancelled → CANCELLED', () => { expect(transformOrder(makeOrder({ status: 'Cancelled' })).status).toBe('CANCELLED') })
  it('passes raw as metadata', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
