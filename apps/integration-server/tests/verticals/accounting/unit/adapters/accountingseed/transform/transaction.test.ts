import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import {
  transformTransaction,
  type AccountingSeedTransaction,
} from '../../../../../../../src/verticals/accounting/adapters/accountingseed/transform/transaction'

function makeTransaction(overrides: Partial<AccountingSeedTransaction> = {}): AccountingSeedTransaction {
  return {
    Id: 'a0I5e000009YZA1',
    Name: 'CR-0001',
    AcctSeed__Account__c: 'gl-cash-001',
    AcctSeed__Type__c: 'Cash Receipt',
    AcctSeed__Reference__c: 'CHK-98765',
    AcctSeed__Memo__c: 'Payment for INV-0001',
    AcctSeed__Payment_Method__c: 'Check',
    CurrencyIsoCode: 'USD',
    AcctSeed__Sub_Total__c: 1350,
    AcctSeed__Tax_Amount__c: 150,
    AcctSeed__Total__c: 1500,
    AcctSeed__Contact__c: 'cont-cust-001',
    AcctSeed__Contact_Name__c: 'Jane Doe',
    AcctSeed__Cash_Receipt_Lines__r: {
      records: [
        {
          Id: 'crline-001',
          Name: 'Receipt Line 1',
          AcctSeed__GL_Account__c: 'gl-ar',
          AcctSeed__Description__c: 'Payment applied',
          AcctSeed__Amount__c: 1500,
          AcctSeed__Quantity__c: 1,
          AcctSeed__Unit_Price__c: 1500,
        },
      ],
    },
    CreatedDate: '2024-04-10T14:00:00.000Z',
    LastModifiedDate: '2024-04-10T14:30:00.000Z',
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps id from Id', () => {
    expect(transformTransaction(makeTransaction()).id).toBe('a0I5e000009YZA1')
  })

  it('maps accountId from Account__c', () => {
    expect(transformTransaction(makeTransaction()).accountId).toBe('gl-cash-001')
  })

  it('maps type from Type__c', () => {
    expect(transformTransaction(makeTransaction()).type).toBe('Cash Receipt')
  })

  it('maps reference', () => {
    expect(transformTransaction(makeTransaction()).reference).toBe('CHK-98765')
  })

  it('maps memo', () => {
    expect(transformTransaction(makeTransaction()).memo).toBe('Payment for INV-0001')
  })

  it('maps paymentMethod', () => {
    expect(transformTransaction(makeTransaction()).paymentMethod).toBe('Check')
  })

  it('maps currency', () => {
    expect(transformTransaction(makeTransaction()).currency).toBe('USD')
  })

  it('maps totalAmount', () => {
    expect(transformTransaction(makeTransaction()).totalAmount).toBe(1500)
  })

  it('maps subTotalAmount', () => {
    expect(transformTransaction(makeTransaction()).subTotalAmount).toBe(1350)
  })

  it('maps taxAmount', () => {
    expect(transformTransaction(makeTransaction()).taxAmount).toBe(150)
  })

  it('maps contacts from Contact__c', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('cont-cust-001')
    expect(result.contacts![0].name).toBe('Jane Doe')
  })

  it('returns undefined contacts when no Contact__c', () => {
    const result = transformTransaction(makeTransaction({ AcctSeed__Contact__c: '' }))
    expect(result.contacts).toBeUndefined()
  })

  it('maps line items', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('crline-001')
    expect(result.lineItems![0].name).toBe('Receipt Line 1')
    expect(result.lineItems![0].totalAmount).toBe(1500)
  })

  it('passes raw object as metadata', () => {
    const raw = makeTransaction()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeTransaction())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
