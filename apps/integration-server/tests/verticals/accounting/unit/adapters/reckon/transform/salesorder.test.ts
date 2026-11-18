import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/reckon/transform/salesorder'
import type { ReckonSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/reckon/transform/order'

function makeRaw(overrides: Partial<ReckonSalesOrder> = {}): ReckonSalesOrder {
  return {
    id: 'so-002',
    orderNumber: 'SO-0002',
    date: '2024-04-05',
    dueDate: '2024-04-20',
    totalAmount: 3300,
    totalTax: 300,
    contactId: 'contact-002',
    contactName: 'Customer Co',
    status: 'FULFILLED',
    lineItems: [],
    ...overrides,
  }
}

describe('transformSalesOrder (reckon)', () => {
  it('maps core fields correctly', () => {
    const result = transformSalesOrder(makeRaw())
    expect(result.id).toBe('so-002')
    expect(result.contactId).toBe('contact-002')
    expect(result.totalAmount).toBe(3300)
    expect(result.status).toBe('COMPLETED')
  })

  it('maps DRAFT status', () => {
    expect(transformSalesOrder(makeRaw({ status: 'DRAFT' })).status).toBe('DRAFT')
  })

  it('maps OPEN to ACTIVE', () => {
    expect(transformSalesOrder(makeRaw({ status: 'OPEN' })).status).toBe('ACTIVE')
  })

  it('maps CANCELLED status', () => {
    expect(transformSalesOrder(makeRaw({ status: 'CANCELLED' })).status).toBe('CANCELLED')
  })

  it('parses date as Date object', () => {
    const result = transformSalesOrder(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-04-05'))
  })

  it('passes raw as metadata identity', () => {
    const raw = makeRaw()
    const result = transformSalesOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeRaw())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
