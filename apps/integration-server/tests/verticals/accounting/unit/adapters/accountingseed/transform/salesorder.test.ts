import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import {
  transformSalesOrder,
  type AccountingSeedSalesOrder,
} from '../../../../../../../src/verticals/accounting/adapters/accountingseed/transform/salesorder'

function makeSalesOrder(overrides: Partial<AccountingSeedSalesOrder> = {}): AccountingSeedSalesOrder {
  return {
    Id: 'so-001',
    Name: 'SO-001',
    AcctSeed__Customer__c: 'cust-1',
    AcctSeed__Status__c: 'Active',
    AcctSeed__Date__c: '2024-01-15',
    CurrencyIsoCode: 'USD',
    AcctSeed__Total__c: 5000,
    AcctSeed__Tax__c: 500,
    AcctSeed__Notes__c: '',
    CreatedDate: '2024-01-10T00:00:00Z',
    LastModifiedDate: '2024-01-12T00:00:00Z',
    ...overrides,
  }
}

describe('transformSalesOrder', () => {
  it('maps Id to id', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.id).toBe('so-001')
  })

  it('maps AcctSeed__Customer__c to contactId', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.contactId).toBe('cust-1')
  })

  it('maps CurrencyIsoCode to currency', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.currency).toBe('USD')
  })

  it('maps AcctSeed__Total__c to totalAmount', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.totalAmount).toBe(5000)
  })

  it('parses AcctSeed__Date__c as Date', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
  })

  it('parses CreatedDate as createdAt', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.createdAt).toEqual(new Date('2024-01-10T00:00:00Z'))
  })

  it('parses LastModifiedDate as updatedAt', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.updatedAt).toEqual(new Date('2024-01-12T00:00:00Z'))
  })

  it('maps ACTIVE status', () => {
    const result = transformSalesOrder(makeSalesOrder({ AcctSeed__Status__c: 'Active' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps draft status to DRAFT', () => {
    const result = transformSalesOrder(makeSalesOrder({ AcctSeed__Status__c: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps completed status to COMPLETED', () => {
    const result = transformSalesOrder(makeSalesOrder({ AcctSeed__Status__c: 'completed' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps invoiced status to COMPLETED', () => {
    const result = transformSalesOrder(makeSalesOrder({ AcctSeed__Status__c: 'invoiced' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps closed status to COMPLETED', () => {
    const result = transformSalesOrder(makeSalesOrder({ AcctSeed__Status__c: 'closed' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps cancelled status to CANCELLED', () => {
    const result = transformSalesOrder(makeSalesOrder({ AcctSeed__Status__c: 'cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps voided status to CANCELLED', () => {
    const result = transformSalesOrder(makeSalesOrder({ AcctSeed__Status__c: 'voided' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps sales order lines to lineItems', () => {
    const raw = makeSalesOrder({
      AcctSeed__Sales_Order_Lines__r: {
        records: [
          {
            Id: 'line-1',
            Name: 'Line 1',
            AcctSeed__GL_Account__c: 'acct-100',
            AcctSeed__Product__c: 'prod-1',
            AcctSeed__Product_Name__c: 'Widget',
            AcctSeed__Unit_Price__c: 100,
            AcctSeed__Quantity__c: 5,
            AcctSeed__Amount__c: 500,
            AcctSeed__Tax_Amount__c: 50,
            AcctSeed__Discount__c: 10,
          },
        ],
      },
    })
    const result = transformSalesOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('line-1')
    expect(li.accountId).toBe('acct-100')
    expect(li.itemId).toBe('prod-1')
    expect(li.itemName).toBe('Widget')
    expect(li.unitAmount).toBe(100)
    expect(li.unitQuantity).toBe(5)
    expect(li.totalAmount).toBe(500)
    expect(li.taxAmount).toBe(50)
    expect(li.discountAmount).toBe(10)
  })

  it('returns empty lineItems when no lines present', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.lineItems).toEqual([])
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
