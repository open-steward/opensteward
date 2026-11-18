import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type LogoOrder } from '../../../../../../../src/verticals/accounting/adapters/logoyazilim/transform/order'

function makeOrder(overrides: Partial<LogoOrder> = {}): LogoOrder {
  return {
    id: '900',
    Date: '2024-06-01',
    Status: 'Active',
    ContactId: '33',
    TotalAmount: 8500,
    ...overrides,
  }
}

describe('transformOrder (logoyazilim)', () => {
  it('maps id correctly', () => {
    expect(transformOrder(makeOrder()).id).toBe('900')
  })

  it('sets type to SALES', () => {
    expect(transformOrder(makeOrder()).type).toBe('SALES')
  })

  it('maps totalAmount and contactId', () => {
    const o = transformOrder(makeOrder())
    expect(o.totalAmount).toBe(8500)
    expect(o.contactId).toBe('33')
  })

  it('maps Active status to ACTIVE', () => {
    expect(transformOrder(makeOrder({ Status: 'Active' })).status).toBe('ACTIVE')
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformOrder(makeOrder({ Status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Completed status to COMPLETED', () => {
    expect(transformOrder(makeOrder({ Status: 'Completed' })).status).toBe('COMPLETED')
  })

  it('maps Cancelled status to CANCELLED', () => {
    expect(transformOrder(makeOrder({ Status: 'Cancelled' })).status).toBe('CANCELLED')
  })

  it('parses date as Date object', () => {
    expect(transformOrder(makeOrder()).postedAt).toEqual(new Date('2024-06-01'))
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
