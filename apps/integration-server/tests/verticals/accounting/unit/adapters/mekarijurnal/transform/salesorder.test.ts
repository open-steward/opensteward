import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type MekariJurnalSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/mekarijurnal/transform/salesorder'

function makeSalesOrder(overrides: Partial<MekariJurnalSalesOrder> = {}): MekariJurnalSalesOrder {
  return {
    id: 450,
    date: '2024-09-01',
    status: 'open',
    person_id: 60,
    total: 1200000,
    currency_code: 'IDR',
    lines: [],
    ...overrides,
  }
}

describe('transformSalesOrder (mekarijurnal)', () => {
  it('maps core fields correctly', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.id).toBe('450')
    expect(result.contactId).toBe('60')
    expect(result.totalAmount).toBe(1200000)
    expect(result.currency).toBe('IDR')
  })

  it('parses date as Date object', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.postedAt).toEqual(new Date('2024-09-01'))
  })

  it('maps open to ACTIVE', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'open' })).status).toBe('ACTIVE')
  })

  it('maps closed to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'closed' })).status).toBe('COMPLETED')
  })

  it('maps cancelled to CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeSalesOrder()
    const result = transformSalesOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
