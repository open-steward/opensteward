import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type NetvisorSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/netvisor/transform/salesorder'

function makeSalesOrder(overrides: Partial<NetvisorSalesOrder> = {}): NetvisorSalesOrder {
  return {
    NetvisorKey: 300,
    OrderNumber: 3001,
    CustomerIdentifier: 'CUST-99',
    Currency: 'EUR',
    OrderDate: '2024-01-15',
    Amount: 8000,
    VatAmount: 1920,
    Status: 'Open',
    OrderLines: [],
    ...overrides,
  }
}

describe('transformSalesOrder (netvisor)', () => {
  it('maps NetvisorKey to id', () => {
    expect(transformSalesOrder(makeSalesOrder()).id).toBe('300')
  })

  it('maps CustomerIdentifier to contactId', () => {
    expect(transformSalesOrder(makeSalesOrder()).contactId).toBe('CUST-99')
  })

  it('maps Amount to totalAmount', () => {
    expect(transformSalesOrder(makeSalesOrder()).totalAmount).toBe(8000)
  })

  it('maps Currency', () => {
    expect(transformSalesOrder(makeSalesOrder()).currency).toBe('EUR')
  })

  it('maps OrderDate to postedAt as Date', () => {
    expect(transformSalesOrder(makeSalesOrder()).postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps status Delivered to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ Status: 'Delivered' })).status).toBe('COMPLETED')
  })

  it('maps status Cancelled to CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ Status: 'Cancelled' })).status).toBe('CANCELLED')
  })

  it('maps status Unsent to DRAFT', () => {
    expect(transformSalesOrder(makeSalesOrder({ Status: 'Unsent' })).status).toBe('DRAFT')
  })

  it('maps unknown status to ACTIVE', () => {
    expect(transformSalesOrder(makeSalesOrder({ Status: 'Processing' })).status).toBe('ACTIVE')
  })

  it('maps OrderLines to lineItems', () => {
    const raw = makeSalesOrder({
      OrderLines: [
        {
          NetvisorKey: 701,
          ProductIdentifier: 'PROD-2',
          ProductName: 'Service',
          Quantity: 1,
          UnitPrice: 2000,
          LineSum: 2000,
          VatPercent: 24,
          AccountNumber: '3010',
        },
      ],
    })
    const result = transformSalesOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('701')
    expect(li.itemId).toBe('PROD-2')
    expect(li.totalAmount).toBe(2000)
    expect(li.accountId).toBe('3010')
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makeSalesOrder()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
