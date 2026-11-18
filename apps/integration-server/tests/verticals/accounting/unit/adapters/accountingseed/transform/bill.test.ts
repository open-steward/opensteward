import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import {
  transformBill,
  type AccountingSeedBill,
} from '../../../../../../../src/verticals/accounting/adapters/accountingseed/transform/bill'

function makeBill(overrides: Partial<AccountingSeedBill> = {}): AccountingSeedBill {
  return {
    Id: 'a0D5e000003DEF1',
    Name: 'AP-0001',
    AcctSeed__Vendor__c: '0015e000003VND1',
    AcctSeed__Status__c: 'Approved',
    AcctSeed__Date__c: '2024-02-15',
    AcctSeed__Due_Date__c: '2024-03-15',
    CurrencyIsoCode: 'USD',
    AcctSeed__Total__c: 2000,
    AcctSeed__Tax__c: 200,
    AcctSeed__Balance__c: 2000,
    AcctSeed__Paid_Amount__c: 0,
    AcctSeed__Payable_Lines__r: {
      records: [
        {
          Id: 'pline-001',
          Name: 'Payable Line 1',
          AcctSeed__GL_Account__c: 'gl-002',
          AcctSeed__Product__c: 'prod-002',
          AcctSeed__Product_Name__c: 'Service B',
          AcctSeed__Unit_Price__c: 200,
          AcctSeed__Quantity__c: 10,
          AcctSeed__Amount__c: 2000,
          AcctSeed__Tax_Amount__c: 200,
        },
      ],
    },
    AcctSeed__Notes__c: 'Monthly service',
    CreatedDate: '2024-02-15T09:00:00.000Z',
    LastModifiedDate: '2024-02-20T11:00:00.000Z',
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps id from Id', () => {
    expect(transformBill(makeBill()).id).toBe('a0D5e000003DEF1')
  })

  it('maps billNumber from Name', () => {
    expect(transformBill(makeBill()).billNumber).toBe('AP-0001')
  })

  it('maps contactId from Vendor__c', () => {
    expect(transformBill(makeBill()).contactId).toBe('0015e000003VND1')
  })

  it('maps status "Approved" to SUBMITTED', () => {
    expect(transformBill(makeBill({ AcctSeed__Status__c: 'Approved' })).status).toBe('SUBMITTED')
  })

  it('maps status "Paid" to PAID', () => {
    expect(transformBill(makeBill({ AcctSeed__Status__c: 'Paid' })).status).toBe('PAID')
  })

  it('maps status "Overdue" to OVERDUE', () => {
    expect(transformBill(makeBill({ AcctSeed__Status__c: 'Overdue' })).status).toBe('OVERDUE')
  })

  it('maps status "Voided" to VOIDED', () => {
    expect(transformBill(makeBill({ AcctSeed__Status__c: 'Voided' })).status).toBe('VOIDED')
  })

  it('maps unknown status to DRAFT', () => {
    expect(transformBill(makeBill({ AcctSeed__Status__c: 'New' })).status).toBe('DRAFT')
  })

  it('maps totalAmount', () => {
    expect(transformBill(makeBill()).totalAmount).toBe(2000)
  })

  it('maps line items', () => {
    const result = transformBill(makeBill())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('pline-001')
    expect(result.lineItems![0].itemName).toBe('Service B')
  })

  it('passes raw object as metadata', () => {
    const raw = makeBill()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
