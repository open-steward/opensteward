import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type MoloniSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/moloni/transform/salesorder'

function makeSalesOrder(overrides: Partial<MoloniSalesOrder> = {}): MoloniSalesOrder {
  return {
    document_id: 500,
    date: '2024-07-01',
    client_id: 60,
    net_value: 800,
    currency_code: 'EUR',
    status: 1,
    ...overrides,
  }
}

describe('transformSalesOrder', () => {
  it('maps core fields correctly', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.id).toBe('500')
    expect(result.contactId).toBe('60')
    expect(result.totalAmount).toBe(800)
    expect(result.currency).toBe('EUR')
  })

  it('parses date as Date object', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.postedAt).toEqual(new Date('2024-07-01'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeSalesOrder({ net_value: 999 })
    const result = transformSalesOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps client_id 0 to undefined contactId', () => {
    const result = transformSalesOrder(makeSalesOrder({ client_id: 0 }))
    expect(result.contactId).toBeUndefined()
  })

  it('returns undefined postedAt when date is empty', () => {
    const result = transformSalesOrder(makeSalesOrder({ date: '' }))
    expect(result.postedAt).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
