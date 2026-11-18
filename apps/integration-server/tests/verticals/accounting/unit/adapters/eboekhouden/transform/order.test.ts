import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type EBoekhoudenOrder } from '../../../../../../../src/verticals/accounting/adapters/eboekhouden/transform/order'

function makeOrder(overrides: Partial<EBoekhoudenOrder> = {}): EBoekhoudenOrder {
  return {
    id: 500,
    orderNumber: 'ORD-001',
    relationId: 42,
    totalInclTax: 2420,
    status: 'active',
    date: '2024-05-01',
    currency: 'EUR',
    ...overrides,
  }
}

describe('transformOrder (eboekhouden)', () => {
  it('maps id and type=SALES', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('500')
    expect(result.type).toBe('SALES')
  })

  it('maps contactId', () => {
    expect(transformOrder(makeOrder()).contactId).toBe('42')
  })

  it('active status → ACTIVE', () => {
    expect(transformOrder(makeOrder({ status: 'active' })).status).toBe('ACTIVE')
  })

  it('draft status → DRAFT', () => {
    expect(transformOrder(makeOrder({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('cancelled status → CANCELLED', () => {
    expect(transformOrder(makeOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
