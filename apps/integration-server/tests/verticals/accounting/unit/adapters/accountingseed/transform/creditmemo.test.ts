import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import {
  transformCreditMemo,
  type AccountingSeedCreditMemo,
} from '../../../../../../../src/verticals/accounting/adapters/accountingseed/transform/creditmemo'

function makeCreditMemo(overrides: Partial<AccountingSeedCreditMemo> = {}): AccountingSeedCreditMemo {
  return {
    Id: 'a0E5e000004JKL1',
    Name: 'CM-0001',
    AcctSeed__Customer__c: '0015e000003CUS1',
    AcctSeed__Status__c: 'Approved',
    AcctSeed__Date__c: '2024-04-01',
    AcctSeed__Due_Date__c: '2024-05-01',
    CurrencyIsoCode: 'USD',
    AcctSeed__Total__c: 500,
    AcctSeed__Tax__c: 50,
    AcctSeed__Balance__c: 500,
    AcctSeed__Paid_Amount__c: 0,
    AcctSeed__Credit_Memo_Lines__r: {
      records: [
        {
          Id: 'cmline-001',
          Name: 'CM Line 1',
          AcctSeed__GL_Account__c: 'gl-003',
          AcctSeed__Product__c: 'prod-003',
          AcctSeed__Product_Name__c: 'Refund Item',
          AcctSeed__Unit_Price__c: 500,
          AcctSeed__Quantity__c: 1,
          AcctSeed__Amount__c: 500,
          AcctSeed__Tax_Amount__c: 50,
        },
      ],
    },
    AcctSeed__Notes__c: 'Billing adjustment',
    CreatedDate: '2024-04-01T09:00:00.000Z',
    LastModifiedDate: '2024-04-05T10:00:00.000Z',
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps id from Id', () => {
    expect(transformCreditMemo(makeCreditMemo()).id).toBe('a0E5e000004JKL1')
  })

  it('maps creditmemoNumber from Name', () => {
    expect(transformCreditMemo(makeCreditMemo()).creditmemoNumber).toBe('CM-0001')
  })

  it('maps contactId from Customer__c', () => {
    expect(transformCreditMemo(makeCreditMemo()).contactId).toBe('0015e000003CUS1')
  })

  it('maps status "Approved" to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditMemo({ AcctSeed__Status__c: 'Approved' })).status).toBe('AUTHORIZED')
  })

  it('maps status "Paid" to PAID', () => {
    expect(transformCreditMemo(makeCreditMemo({ AcctSeed__Status__c: 'Paid' })).status).toBe('PAID')
  })

  it('maps status "Partially Paid" to PARTIALLY_PAID', () => {
    expect(transformCreditMemo(makeCreditMemo({ AcctSeed__Status__c: 'Partially Paid' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps status "Voided" to VOIDED', () => {
    expect(transformCreditMemo(makeCreditMemo({ AcctSeed__Status__c: 'Voided' })).status).toBe('VOIDED')
  })

  it('maps status "Deleted" to DELETED', () => {
    expect(transformCreditMemo(makeCreditMemo({ AcctSeed__Status__c: 'Deleted' })).status).toBe('DELETED')
  })

  it('maps unknown status to DRAFT', () => {
    expect(transformCreditMemo(makeCreditMemo({ AcctSeed__Status__c: 'New' })).status).toBe('DRAFT')
  })

  it('does not map to OVERDUE or SUBMITTED (not in CreditMemoStatus)', () => {
    // CreditMemoStatus only allows: DRAFT, AUTHORIZED, PAID, PARTIALLY_PAID, VOIDED, DELETED
    const result = transformCreditMemo(makeCreditMemo({ AcctSeed__Status__c: 'Posted' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps totalAmount', () => {
    expect(transformCreditMemo(makeCreditMemo()).totalAmount).toBe(500)
  })

  it('maps line items', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('cmline-001')
    expect(result.lineItems![0].itemName).toBe('Refund Item')
  })

  it('passes raw object as metadata', () => {
    const raw = makeCreditMemo()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
