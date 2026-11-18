import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import {
  transformSalesOrder,
  type DineroSalesOrder,
} from '../../../../../../../src/verticals/accounting/adapters/dinero/transform/salesorder'

function makeSalesOrder(overrides: Partial<DineroSalesOrder> = {}): DineroSalesOrder {
  return {
    Guid: 'guid-so-1',
    Number: 300,
    ContactGuid: 'customer-guid-1',
    Currency: 'DKK',
    Date: '2024-01-15',
    TotalInclVat: 18000,
    TotalVat: 3600,
    Status: 'Active',
    OrderLines: [],
    ...overrides,
  }
}

describe('transformSalesOrder', () => {
  it('maps Guid to id', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.id).toBe('guid-so-1')
  })

  it('maps ContactGuid to contactId', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.contactId).toBe('customer-guid-1')
  })

  it('maps Currency to currency', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.currency).toBe('DKK')
  })

  it('maps TotalInclVat to totalAmount', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.totalAmount).toBe(18000)
  })

  it('parses Date as Date object', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps Active status to ACTIVE', () => {
    const result = transformSalesOrder(makeSalesOrder({ Status: 'Active' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps Draft status to DRAFT', () => {
    const result = transformSalesOrder(makeSalesOrder({ Status: 'Draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps Invoiced status to COMPLETED', () => {
    const result = transformSalesOrder(makeSalesOrder({ Status: 'Invoiced' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps Cancelled status to CANCELLED', () => {
    const result = transformSalesOrder(makeSalesOrder({ Status: 'Cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps OrderLines to lineItems', () => {
    const raw = makeSalesOrder({
      OrderLines: [
        {
          Guid: 'soline-guid-1',
          ProductGuid: 'prod-guid-3',
          Description: 'Premium Service',
          Quantity: 2,
          AccountNumber: 3000,
          BaseAmountValue: 1500,
          TotalAmount: 3000,
          VatAmount: 600,
        },
      ],
    })
    const result = transformSalesOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('soline-guid-1')
    expect(li.itemId).toBe('prod-guid-3')
    expect(li.itemDescription).toBe('Premium Service')
    expect(li.unitAmount).toBe(1500)
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(3000)
    expect(li.taxAmount).toBe(600)
    expect(li.accountId).toBe('3000')
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
