import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type SilverfinSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/silverfin/transform/salesorder'

function makeSalesOrder(overrides: Partial<SilverfinSalesOrder> = {}): SilverfinSalesOrder {
  return {
    id: '6001',
    status: 'draft',
    order_number: 'SO-2024-001',
    period: '2024-03-12',
    total_amount: 3500,
    currency: 'EUR',
    contact_id: '18',
    lines: [],
    ...overrides,
  }
}

describe('transformSalesOrder (Silverfin)', () => {
  it('maps core fields correctly', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.id).toBe('6001')
    expect(result.contactId).toBe('18')
    expect(result.totalAmount).toBe(3500)
    expect(result.currency).toBe('EUR')
  })

  it('parses period as postedAt Date', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.postedAt).toEqual(new Date('2024-03-12'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeSalesOrder()
    const result = transformSalesOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps draft status to DRAFT', () => {
    const result = transformSalesOrder(makeSalesOrder({ status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps approved status to ACTIVE', () => {
    const result = transformSalesOrder(makeSalesOrder({ status: 'approved' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps completed status to COMPLETED', () => {
    const result = transformSalesOrder(makeSalesOrder({ status: 'completed' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps cancelled status to CANCELLED', () => {
    const result = transformSalesOrder(makeSalesOrder({ status: 'cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('returns empty lineItems array when lines is absent', () => {
    const result = transformSalesOrder(makeSalesOrder({ lines: [] }))
    expect(result.lineItems).toEqual([])
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
