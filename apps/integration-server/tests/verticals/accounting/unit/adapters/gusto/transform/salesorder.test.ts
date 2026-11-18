import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type GustoSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/gusto/transform/salesorder'

function makeSalesOrder(overrides: Partial<GustoSalesOrder> = {}): GustoSalesOrder {
  return {
    id: 'so_001',
    status: 'draft',
    date: '2024-03-05',
    company_id: 'co_001',
    total_amount: 3000,
    currency: 'USD',
    lines: [],
    ...overrides,
  }
}

describe('transformSalesOrder (Gusto)', () => {
  it('maps id to string', () => {
    expect(transformSalesOrder(makeSalesOrder({ id: 'so_001' })).id).toBe('so_001')
  })

  it('maps numeric id to string', () => {
    expect(transformSalesOrder(makeSalesOrder({ id: 12 })).id).toBe('12')
  })

  it('maps total_amount', () => {
    expect(transformSalesOrder(makeSalesOrder({ total_amount: 4500 })).totalAmount).toBe(4500)
  })

  it('maps company_id to contactId', () => {
    expect(transformSalesOrder(makeSalesOrder({ company_id: 'co_88' })).contactId).toBe('co_88')
  })

  it('maps currency', () => {
    expect(transformSalesOrder(makeSalesOrder({ currency: 'GBP' })).currency).toBe('GBP')
  })

  it('maps draft status to DRAFT', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps active status to ACTIVE', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'active' })).status).toBe('ACTIVE')
  })

  it('maps delivered status to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'delivered' })).status).toBe('COMPLETED')
  })

  it('maps cancelled status to CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps unknown status to DRAFT', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'unknown' })).status).toBe('DRAFT')
  })

  it('parses date as Date', () => {
    expect(transformSalesOrder(makeSalesOrder({ date: '2024-03-05' })).postedAt).toEqual(new Date('2024-03-05'))
  })

  it('passes raw object as metadata by reference', () => {
    const raw = makeSalesOrder()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeSalesOrder({ id: 'so_001' }))
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
