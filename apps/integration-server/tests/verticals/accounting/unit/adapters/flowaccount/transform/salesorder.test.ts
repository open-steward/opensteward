import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type FlowAccountSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/flowaccount/transform/salesorder'

function makeSalesOrder(overrides: Partial<FlowAccountSalesOrder> = {}): FlowAccountSalesOrder {
  return {
    id: 1100,
    documentSerial: 'SO2024-00001',
    statusId: 2,
    issuedDate: '2024-01-08',
    amountTotal: 15000,
    currencyCode: 'THB',
    contactCode: 'CUST-003',
    items: [],
    ...overrides,
  }
}

describe('transformSalesOrder', () => {
  it('maps core fields correctly', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.id).toBe('1100')
    expect(result.contactId).toBe('CUST-003')
    expect(result.totalAmount).toBe(15000)
    expect(result.currency).toBe('THB')
  })

  it('parses date as Date object', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.postedAt).toEqual(new Date('2024-01-08'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeSalesOrder()
    const result = transformSalesOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps statusId 1 to DRAFT', () => {
    expect(transformSalesOrder(makeSalesOrder({ statusId: 1 })).status).toBe('DRAFT')
  })

  it('maps statusId 2 to ACTIVE', () => {
    expect(transformSalesOrder(makeSalesOrder({ statusId: 2 })).status).toBe('ACTIVE')
  })

  it('maps statusId 3 to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ statusId: 3 })).status).toBe('COMPLETED')
  })

  it('maps statusId 4 to CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ statusId: 4 })).status).toBe('CANCELLED')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
