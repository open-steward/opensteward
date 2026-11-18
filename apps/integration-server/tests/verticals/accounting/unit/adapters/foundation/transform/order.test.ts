import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type FoundationOrder } from '../../../../../../../src/verticals/accounting/adapters/foundation/transform/order'

function makeOrder(overrides: Partial<FoundationOrder> = {}): FoundationOrder {
  return {
    OrderId: 'ORD-001',
    OrderNumber: 'PO-001',
    JobNumber: 'JOB-100',
    VendorId: 'VEND-42',
    OrderDate: '2024-03-01',
    TotalAmount: 3000,
    Currency: 'USD',
    Status: 'Draft',
    Lines: [],
    ...overrides,
  }
}

describe('transformOrder (Foundation)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('ORD-001')
    expect(result.contactId).toBe('VEND-42')
    expect(result.totalAmount).toBe(3000)
    expect(result.currency).toBe('USD')
  })

  it('parses date as Date object', () => {
    const result = transformOrder(makeOrder())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformOrder(makeOrder({ Status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Approved status to ACTIVE', () => {
    expect(transformOrder(makeOrder({ Status: 'Approved' })).status).toBe('ACTIVE')
  })

  it('maps Completed status to COMPLETED', () => {
    expect(transformOrder(makeOrder({ Status: 'Completed' })).status).toBe('COMPLETED')
  })

  it('maps Cancelled status to CANCELLED', () => {
    expect(transformOrder(makeOrder({ Status: 'Cancelled' })).status).toBe('CANCELLED')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
