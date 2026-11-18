import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type CertiniaPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/certinia/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<CertiniaPurchaseOrder> = {}): CertiniaPurchaseOrder {
  return {
    Id: 'PO0000000001',
    Name: 'PO-2024-001',
    Status__c: 'Draft',
    Order_Date__c: '2024-03-01',
    Total_Amount__c: 15000,
    Currency__c: 'USD',
    Vendor__c: 'VEND-001',
    Lines__r: null,
    ...overrides,
  }
}

describe('transformPurchaseOrder (Certinia)', () => {
  it('maps core fields correctly', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.id).toBe('PO0000000001')
    expect(result.contactId).toBe('VEND-001')
    expect(result.totalAmount).toBe(15000)
    expect(result.currency).toBe('USD')
  })

  it('parses date as Date object', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makePurchaseOrder()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ Status__c: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Active status to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ Status__c: 'Active' })).status).toBe('ACTIVE')
  })

  it('maps Received status to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ Status__c: 'Received' })).status).toBe('COMPLETED')
  })

  it('maps Cancelled status to CANCELLED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ Status__c: 'Cancelled' })).status).toBe('CANCELLED')
  })

  it('returns empty lineItems when Lines__r is null', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ Lines__r: null })).lineItems).toEqual([])
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
