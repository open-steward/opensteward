import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type ParasutSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/parasut/transform/salesorder'

function makeSalesOrder(overrides: Partial<ParasutSalesOrder> = {}): ParasutSalesOrder {
  return {
    id: 'so_1',
    type: 'sales_invoices',
    attributes: {
      status: 'sent',
      invoice_no: 'SO-001',
      gross_total: 7500,
      issue_date: '2024-06-01',
      currency: 'TRY',
      contact_id: 'cust_8',
      sales_channel: 'online',
    },
    ...overrides,
  }
}

describe('transformSalesOrder (parasut)', () => {
  it('maps id correctly', () => {
    expect(transformSalesOrder(makeSalesOrder()).id).toBe('so_1')
  })

  it('maps totalAmount and currency', () => {
    const so = transformSalesOrder(makeSalesOrder())
    expect(so.totalAmount).toBe(7500)
    expect(so.currency).toBe('TRY')
  })

  it('maps contactId', () => {
    expect(transformSalesOrder(makeSalesOrder()).contactId).toBe('cust_8')
  })

  it('maps salesChannel', () => {
    expect(transformSalesOrder(makeSalesOrder()).salesChannel).toBe('online')
  })

  it('maps sent status to ACTIVE', () => {
    expect(transformSalesOrder(makeSalesOrder()).status).toBe('ACTIVE')
  })

  it('maps draft status to DRAFT', () => {
    const raw = makeSalesOrder({ attributes: { ...makeSalesOrder().attributes, status: 'draft' } })
    expect(transformSalesOrder(raw).status).toBe('DRAFT')
  })

  it('maps cancelled status to CANCELLED', () => {
    const raw = makeSalesOrder({ attributes: { ...makeSalesOrder().attributes, status: 'cancelled' } })
    expect(transformSalesOrder(raw).status).toBe('CANCELLED')
  })

  it('maps completed status to COMPLETED', () => {
    const raw = makeSalesOrder({ attributes: { ...makeSalesOrder().attributes, status: 'completed' } })
    expect(transformSalesOrder(raw).status).toBe('COMPLETED')
  })

  it('parses date as Date object', () => {
    expect(transformSalesOrder(makeSalesOrder()).postedAt).toEqual(new Date('2024-06-01'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeSalesOrder()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
