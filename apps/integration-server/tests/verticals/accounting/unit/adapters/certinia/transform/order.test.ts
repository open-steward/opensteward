import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type CertiniaOrder } from '../../../../../../../src/verticals/accounting/adapters/certinia/transform/order'

function makeOrder(overrides: Partial<CertiniaOrder> = {}): CertiniaOrder {
  return {
    Id: 'ORD000000001',
    Name: 'ORD-2024-001',
    Status__c: 'Draft',
    Order_Date__c: '2024-03-01',
    Total_Amount__c: 25000,
    Currency__c: 'USD',
    Account__c: 'ACCT-001',
    Lines__r: null,
    ...overrides,
  }
}

describe('transformOrder (Certinia)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('ORD000000001')
    expect(result.contactId).toBe('ACCT-001')
    expect(result.totalAmount).toBe(25000)
    expect(result.currency).toBe('USD')
  })

  it('parses date as Date object', () => {
    const result = transformOrder(makeOrder())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformOrder(makeOrder({ Status__c: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Active status to ACTIVE', () => {
    expect(transformOrder(makeOrder({ Status__c: 'Active' })).status).toBe('ACTIVE')
  })

  it('maps Completed status to COMPLETED', () => {
    expect(transformOrder(makeOrder({ Status__c: 'Completed' })).status).toBe('COMPLETED')
  })

  it('maps Cancelled status to CANCELLED', () => {
    expect(transformOrder(makeOrder({ Status__c: 'Cancelled' })).status).toBe('CANCELLED')
  })

  it('returns empty lineItems when Lines__r is null', () => {
    expect(transformOrder(makeOrder({ Lines__r: null })).lineItems).toEqual([])
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
