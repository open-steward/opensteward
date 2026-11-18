import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import {
  transformExpense,
  type AccountingSeedExpense,
} from '../../../../../../../src/verticals/accounting/adapters/accountingseed/transform/expense'

function makeExpense(overrides: Partial<AccountingSeedExpense> = {}): AccountingSeedExpense {
  return {
    Id: 'a0F5e000005MNO1',
    Name: 'EXP-0001',
    AcctSeed__Account__c: 'gl-exp-001',
    AcctSeed__Vendor__c: '0015e000003VND2',
    AcctSeed__Employee__c: '0055e000006EMP1',
    AcctSeed__Approver__c: '0055e000006MGR1',
    CurrencyIsoCode: 'USD',
    AcctSeed__Payment_Method__c: 'Credit Card',
    AcctSeed__Tax_Amount__c: 25,
    AcctSeed__Total__c: 275,
    AcctSeed__Reimbursed_Amount__c: 275,
    AcctSeed__Date__c: '2024-03-10',
    AcctSeed__Approved_Date__c: '2024-03-12',
    AcctSeed__Reimbursed_Date__c: '2024-03-20',
    AcctSeed__Expense_Lines__r: {
      records: [
        {
          Id: 'eline-001',
          Name: 'Travel Expense',
          AcctSeed__GL_Account__c: 'gl-travel',
          AcctSeed__Amount__c: 275,
          AcctSeed__Description__c: 'Flight to NYC',
        },
      ],
    },
    CreatedDate: '2024-03-10T07:00:00.000Z',
    LastModifiedDate: '2024-03-20T15:00:00.000Z',
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps id from Id', () => {
    expect(transformExpense(makeExpense()).id).toBe('a0F5e000005MNO1')
  })

  it('maps name from Name', () => {
    expect(transformExpense(makeExpense()).name).toBe('EXP-0001')
  })

  it('maps accountId from Account__c', () => {
    expect(transformExpense(makeExpense()).accountId).toBe('gl-exp-001')
  })

  it('maps contactId from Vendor__c', () => {
    expect(transformExpense(makeExpense()).contactId).toBe('0015e000003VND2')
  })

  it('maps userId from Employee__c', () => {
    expect(transformExpense(makeExpense()).userId).toBe('0055e000006EMP1')
  })

  it('maps approverUserId from Approver__c', () => {
    expect(transformExpense(makeExpense()).approverUserId).toBe('0055e000006MGR1')
  })

  it('maps paymentMethod', () => {
    expect(transformExpense(makeExpense()).paymentMethod).toBe('Credit Card')
  })

  it('maps totalAmount', () => {
    expect(transformExpense(makeExpense()).totalAmount).toBe(275)
  })

  it('maps taxAmount', () => {
    expect(transformExpense(makeExpense()).taxAmount).toBe(25)
  })

  it('maps reimbursedAmount', () => {
    expect(transformExpense(makeExpense()).reimbursedAmount).toBe(275)
  })

  it('maps line items', () => {
    const result = transformExpense(makeExpense())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('eline-001')
    expect(result.lineItems![0].itemName).toBe('Travel Expense')
    expect(result.lineItems![0].itemDescription).toBe('Flight to NYC')
  })

  it('maps dates', () => {
    const result = transformExpense(makeExpense())
    expect(result.postedAt).toEqual(new Date('2024-03-10'))
    expect(result.approvedAt).toEqual(new Date('2024-03-12'))
    expect(result.reimbursedAt).toEqual(new Date('2024-03-20'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeExpense()
    expect(transformExpense(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeExpense())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
