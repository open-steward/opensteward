import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import {
  transformSalesOrder,
  type FreeAgentSalesOrder,
} from '../../../../../../../src/verticals/accounting/adapters/freeagent/transform/salesorder'

function makeSalesOrder(overrides: Partial<FreeAgentSalesOrder> = {}): FreeAgentSalesOrder {
  return {
    url: 'https://api.freeagent.com/v2/sales_orders/66',
    contact: 'https://api.freeagent.com/v2/contacts/25',
    reference: 'SO-2024-001',
    dated_on: '2024-09-01',
    currency: 'GBP',
    total_value: '1800.00',
    status: 'Sent',
    ...overrides,
  }
}

describe('transformSalesOrder', () => {
  it('extracts id from url', () => {
    expect(transformSalesOrder(makeSalesOrder()).id).toBe('66')
  })

  it('extracts contactId from contact url', () => {
    expect(transformSalesOrder(makeSalesOrder()).contactId).toBe('25')
  })

  it('maps currency correctly', () => {
    expect(transformSalesOrder(makeSalesOrder()).currency).toBe('GBP')
  })

  it('parses totalAmount from total_value', () => {
    expect(transformSalesOrder(makeSalesOrder()).totalAmount).toBe(1800)
  })

  it('parses dated_on as postedAt Date', () => {
    expect(transformSalesOrder(makeSalesOrder()).postedAt).toEqual(new Date('2024-09-01'))
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Sent status to ACTIVE', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'Sent' })).status).toBe('ACTIVE')
  })

  it('maps Fulfilled status to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'Fulfilled' })).status).toBe('COMPLETED')
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
