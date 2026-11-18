import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type MaxioSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/maxio/transform/salesorder'

function makeSalesOrder(overrides: Partial<MaxioSalesOrder> = {}): MaxioSalesOrder {
  return {
    id: 600,
    state: 'active',
    created_at: '2024-03-11T00:00:00Z',
    currency: 'USD',
    total_amount_in_cents: 99900,
    customer_id: 55,
    line_items: [],
    ...overrides,
  }
}

describe('transformSalesOrder (Maxio)', () => {
  it('maps id as string', () => {
    expect(transformSalesOrder(makeSalesOrder()).id).toBe('600')
  })

  it('maps contacts from customer_id as string', () => {
    expect(transformSalesOrder(makeSalesOrder()).contactId).toBe('55')
  })

  it('converts total_amount_in_cents to dollars', () => {
    expect(transformSalesOrder(makeSalesOrder({ total_amount_in_cents: 99900 })).totalAmount).toBe(999)
  })

  it('maps currency', () => {
    expect(transformSalesOrder(makeSalesOrder()).currency).toBe('USD')
  })

  it('parses created_at as Date', () => {
    expect(transformSalesOrder(makeSalesOrder()).postedAt).toEqual(new Date('2024-03-11T00:00:00Z'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeSalesOrder()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })

  it('maps active state to ACTIVE', () => {
    expect(transformSalesOrder(makeSalesOrder({ state: 'active' })).status).toBe('ACTIVE')
  })

  it('maps completed state to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ state: 'completed' })).status).toBe('COMPLETED')
  })

  it('maps canceled state to CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ state: 'canceled' })).status).toBe('CANCELLED')
  })

  it('maps unknown state to DRAFT', () => {
    expect(transformSalesOrder(makeSalesOrder({ state: 'pending' })).status).toBe('DRAFT')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
