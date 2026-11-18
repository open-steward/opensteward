import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type CertiniaSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/certinia/transform/salesorder'

function makeSalesOrder(overrides: Partial<CertiniaSalesOrder> = {}): CertiniaSalesOrder {
  return {
    Id: 'SO0000000001',
    Name: 'SO-2024-001',
    Status__c: 'Draft',
    Order_Date__c: '2024-03-01',
    Total_Amount__c: 80000,
    Currency__c: 'USD',
    Account__c: 'ACCT-001',
    Lines__r: null,
    ...overrides,
  }
}

describe('transformSalesOrder (Certinia)', () => {
  it('maps core fields correctly', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.id).toBe('SO0000000001')
    expect(result.contactId).toBe('ACCT-001')
    expect(result.totalAmount).toBe(80000)
    expect(result.currency).toBe('USD')
  })

  it('parses date as Date object', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeSalesOrder()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformSalesOrder(makeSalesOrder({ Status__c: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Active status to ACTIVE', () => {
    expect(transformSalesOrder(makeSalesOrder({ Status__c: 'Active' })).status).toBe('ACTIVE')
  })

  it('maps Delivered status to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ Status__c: 'Delivered' })).status).toBe('COMPLETED')
  })

  it('maps Cancelled status to CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ Status__c: 'Cancelled' })).status).toBe('CANCELLED')
  })

  it('returns empty lineItems when Lines__r is null', () => {
    expect(transformSalesOrder(makeSalesOrder({ Lines__r: null })).lineItems).toEqual([])
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
