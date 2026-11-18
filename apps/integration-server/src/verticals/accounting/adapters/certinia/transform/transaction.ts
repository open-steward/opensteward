import type { Transaction } from '../../../schema/transaction'

export interface CertiniaTransaction {
  Id: string
  Name: string
  Transaction_Date__c: string
  Description__c: string
  Amount__c: number
  Currency__c: string
  [key: string]: unknown
}

export function transformTransaction(raw: CertiniaTransaction): Transaction {
  return {
    id: String(raw.Id),
    memo: raw.Description__c || undefined,
    totalAmount: raw.Amount__c,
    currency: raw.Currency__c || undefined,
    createdAt: raw.Transaction_Date__c ? new Date(raw.Transaction_Date__c) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
