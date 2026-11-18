import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface AccountingSeedExpenseLineItem {
  Id: string
  Name: string
  AcctSeed__GL_Account__c: string
  AcctSeed__Amount__c: number
  AcctSeed__Description__c: string
  [key: string]: unknown
}

export interface AccountingSeedExpense {
  Id: string
  Name: string
  AcctSeed__Account__c: string
  AcctSeed__Vendor__c: string
  AcctSeed__Employee__c: string
  AcctSeed__Approver__c: string
  CurrencyIsoCode: string
  AcctSeed__Payment_Method__c: string
  AcctSeed__Tax_Amount__c: number
  AcctSeed__Total__c: number
  AcctSeed__Reimbursed_Amount__c: number
  AcctSeed__Date__c: string
  AcctSeed__Approved_Date__c: string
  AcctSeed__Reimbursed_Date__c: string
  AcctSeed__Expense_Lines__r?: { records: AccountingSeedExpenseLineItem[] }
  CreatedDate: string
  LastModifiedDate: string
  [key: string]: unknown
}

function mapLineitem(row: AccountingSeedExpenseLineItem): Lineitem {
  return {
    id: row.Id,
    accountId: row.AcctSeed__GL_Account__c || undefined,
    itemName: row.Name || undefined,
    itemDescription: row.AcctSeed__Description__c || undefined,
    totalAmount: row.AcctSeed__Amount__c ?? undefined,
  }
}

export function transformExpense(raw: AccountingSeedExpense): Expense {
  const lines = raw.AcctSeed__Expense_Lines__r?.records ?? []
  return {
    id: raw.Id,
    name: raw.Name || undefined,
    accountId: raw.AcctSeed__Account__c || undefined,
    contactId: raw.AcctSeed__Vendor__c || undefined,
    userId: raw.AcctSeed__Employee__c || undefined,
    approverUserId: raw.AcctSeed__Approver__c || undefined,
    currency: raw.CurrencyIsoCode || undefined,
    paymentMethod: raw.AcctSeed__Payment_Method__c || undefined,
    taxAmount: raw.AcctSeed__Tax_Amount__c ?? undefined,
    totalAmount: raw.AcctSeed__Total__c ?? undefined,
    reimbursedAmount: raw.AcctSeed__Reimbursed_Amount__c ?? undefined,
    lineItems: lines.map(mapLineitem),
    postedAt: raw.AcctSeed__Date__c ? new Date(raw.AcctSeed__Date__c) : undefined,
    approvedAt: raw.AcctSeed__Approved_Date__c ? new Date(raw.AcctSeed__Approved_Date__c) : undefined,
    reimbursedAt: raw.AcctSeed__Reimbursed_Date__c ? new Date(raw.AcctSeed__Reimbursed_Date__c) : undefined,
    createdAt: raw.CreatedDate ? new Date(raw.CreatedDate) : undefined,
    updatedAt: raw.LastModifiedDate ? new Date(raw.LastModifiedDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
