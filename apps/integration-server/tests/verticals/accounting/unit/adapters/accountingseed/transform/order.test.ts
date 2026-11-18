import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type AccountingSeedOrder } from '../../../../../../../src/verticals/accounting/adapters/accountingseed/transform/order'

function makeOrder(overrides: Partial<AccountingSeedOrder> = {}): AccountingSeedOrder {
  return {
    Id: 'order-1',
    Name: 'ORD-001',
    AcctSeed__Customer__c: 'contact-1',
    AcctSeed__Status__c: 'Active',
    AcctSeed__Date__c: '2024-01-15',
    CurrencyIsoCode: 'USD',
    AcctSeed__Total__c: 5000,
    AcctSeed__Tax__c: 400,
    AcctSeed__Notes__c: '',
    CreatedDate: '2024-01-10T00:00:00Z',
    LastModifiedDate: '2024-01-12T00:00:00Z',
    ...overrides,
  }
}

describe('transformOrder (accountingseed)', () => {
  it('maps Id and core fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('order-1')
    expect(result.contactId).toBe('contact-1')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(5000)
    expect(result.type).toBe('SALES')
  })

  it('parses AcctSeed__Date__c as Date object', () => {
    const result = transformOrder(makeOrder())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
  })

  it('parses CreatedDate and LastModifiedDate as Date objects', () => {
    const result = transformOrder(makeOrder())
    expect(result.createdAt).toEqual(new Date('2024-01-10T00:00:00Z'))
    expect(result.updatedAt).toEqual(new Date('2024-01-12T00:00:00Z'))
  })

  it('maps status "Active" to ACTIVE', () => {
    const result = transformOrder(makeOrder({ AcctSeed__Status__c: 'Active' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps status "draft" to DRAFT', () => {
    const result = transformOrder(makeOrder({ AcctSeed__Status__c: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps status "completed" to COMPLETED', () => {
    const result = transformOrder(makeOrder({ AcctSeed__Status__c: 'completed' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps status "invoiced" to COMPLETED', () => {
    const result = transformOrder(makeOrder({ AcctSeed__Status__c: 'invoiced' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps status "closed" to COMPLETED', () => {
    const result = transformOrder(makeOrder({ AcctSeed__Status__c: 'closed' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps status "cancelled" to CANCELLED', () => {
    const result = transformOrder(makeOrder({ AcctSeed__Status__c: 'cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps status "void" to CANCELLED', () => {
    const result = transformOrder(makeOrder({ AcctSeed__Status__c: 'void' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps status "voided" to CANCELLED', () => {
    const result = transformOrder(makeOrder({ AcctSeed__Status__c: 'voided' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps order lines from AcctSeed__Order_Lines__r.records', () => {
    const raw = makeOrder({
      AcctSeed__Order_Lines__r: {
        records: [
          {
            Id: 'line-1',
            Name: 'Line 1',
            AcctSeed__GL_Account__c: '3000',
            AcctSeed__Product__c: 'prod-1',
            AcctSeed__Product_Name__c: 'Widget',
            AcctSeed__Unit_Price__c: 100,
            AcctSeed__Quantity__c: 5,
            AcctSeed__Amount__c: 500,
            AcctSeed__Tax_Amount__c: 40,
            AcctSeed__Discount__c: 0,
          },
        ],
      },
    })
    const result = transformOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('line-1')
    expect(li.accountId).toBe('3000')
    expect(li.itemId).toBe('prod-1')
    expect(li.itemName).toBe('Widget')
    expect(li.unitAmount).toBe(100)
    expect(li.unitQuantity).toBe(5)
    expect(li.totalAmount).toBe(500)
    expect(li.taxAmount).toBe(40)
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
