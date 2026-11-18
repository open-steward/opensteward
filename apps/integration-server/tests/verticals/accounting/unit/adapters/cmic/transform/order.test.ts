import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type CmicOrder } from '../../../../../../../src/verticals/accounting/adapters/cmic/transform/order'

function makeOrder(overrides: Partial<CmicOrder> = {}): CmicOrder {
  return {
    OrderId: 'ORD-001',
    OrderNumber: 'SC-2024-001',
    Status: 'Draft',
    SubcontractorId: 'SUB-456',
    ProjectCode: 'PRJ-001',
    Currency: 'USD',
    TotalAmount: 50000,
    OrderDate: '2024-02-15',
    Lines: [],
    ...overrides,
  }
}

describe('transformOrder (CMiC)', () => {
  it('maps id from OrderId', () => {
    expect(transformOrder(makeOrder()).id).toBe('ORD-001')
  })

  it('maps core fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.contactId).toBe('SUB-456')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(50000)
  })

  it('parses OrderDate as Date object', () => {
    expect(transformOrder(makeOrder()).postedAt).toEqual(new Date('2024-02-15'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformOrder(makeOrder({ Status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Approved status to ACTIVE', () => {
    expect(transformOrder(makeOrder({ Status: 'Approved' })).status).toBe('ACTIVE')
  })

  it('maps Closed status to COMPLETED', () => {
    expect(transformOrder(makeOrder({ Status: 'Closed' })).status).toBe('COMPLETED')
  })

  it('maps Void status to CANCELLED', () => {
    expect(transformOrder(makeOrder({ Status: 'Void' })).status).toBe('CANCELLED')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
