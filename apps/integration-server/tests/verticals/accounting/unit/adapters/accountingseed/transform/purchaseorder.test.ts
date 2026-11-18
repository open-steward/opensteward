import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type AccountingSeedPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/accountingseed/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<AccountingSeedPurchaseOrder> = {}): AccountingSeedPurchaseOrder {
  return {
    Id: 'po-1',
    Name: 'PO-001',
    AcctSeed__Vendor__c: 'vendor-1',
    AcctSeed__Status__c: 'Active',
    AcctSeed__Date__c: '2024-01-15',
    CurrencyIsoCode: 'USD',
    AcctSeed__Total__c: 8000,
    AcctSeed__Tax__c: 640,
    AcctSeed__Notes__c: '',
    CreatedDate: '2024-01-10T00:00:00Z',
    LastModifiedDate: '2024-01-12T00:00:00Z',
    ...overrides,
  }
}

describe('transformPurchaseOrder (accountingseed)', () => {
  it('maps Id and core fields', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.id).toBe('po-1')
    expect(result.contactId).toBe('vendor-1')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(8000)
  })

  it('parses AcctSeed__Date__c as Date object', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
  })

  it('parses CreatedDate and LastModifiedDate as Date objects', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.createdAt).toEqual(new Date('2024-01-10T00:00:00Z'))
    expect(result.updatedAt).toEqual(new Date('2024-01-12T00:00:00Z'))
  })

  it('maps status "Active" to ACTIVE', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ AcctSeed__Status__c: 'Active' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps status "draft" to DRAFT', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ AcctSeed__Status__c: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps status "received" to COMPLETED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ AcctSeed__Status__c: 'received' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps status "completed" to COMPLETED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ AcctSeed__Status__c: 'completed' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps status "closed" to COMPLETED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ AcctSeed__Status__c: 'closed' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps status "cancelled" to CANCELLED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ AcctSeed__Status__c: 'cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps status "void" to CANCELLED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ AcctSeed__Status__c: 'void' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps status "voided" to CANCELLED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ AcctSeed__Status__c: 'voided' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps purchase order lines from AcctSeed__Purchase_Order_Lines__r.records', () => {
    const raw = makePurchaseOrder({
      AcctSeed__Purchase_Order_Lines__r: {
        records: [
          {
            Id: 'line-1',
            Name: 'Line 1',
            AcctSeed__GL_Account__c: '5000',
            AcctSeed__Product__c: 'prod-2',
            AcctSeed__Product_Name__c: 'Component',
            AcctSeed__Unit_Price__c: 200,
            AcctSeed__Quantity__c: 10,
            AcctSeed__Amount__c: 2000,
            AcctSeed__Tax_Amount__c: 160,
          },
        ],
      },
    })
    const result = transformPurchaseOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('line-1')
    expect(li.accountId).toBe('5000')
    expect(li.itemId).toBe('prod-2')
    expect(li.itemName).toBe('Component')
    expect(li.unitAmount).toBe(200)
    expect(li.unitQuantity).toBe(10)
    expect(li.totalAmount).toBe(2000)
    expect(li.taxAmount).toBe(160)
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makePurchaseOrder()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
