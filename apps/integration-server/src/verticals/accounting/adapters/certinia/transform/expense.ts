import type { Expense } from '../../../schema/expense'

export interface CertiniaExpense {
  Id: string
  Name: string
  Expense_Date__c: string
  Description__c: string
  Amount__c: number
  Employee__c: string
  [key: string]: unknown
}

export function transformExpense(raw: CertiniaExpense): Expense {
  return {
    id: String(raw.Id),
    totalAmount: raw.Amount__c,
    name: raw.Description__c || undefined,
    contactId: raw.Employee__c || undefined,
    postedAt: raw.Expense_Date__c ? new Date(raw.Expense_Date__c) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
