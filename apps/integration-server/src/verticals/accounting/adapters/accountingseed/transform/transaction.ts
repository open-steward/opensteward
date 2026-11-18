import type { Transaction } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'

export interface AccountingSeedTransactionLineItem {
  Id: string
  Name: string
  AcctSeed__GL_Account__c: string
  AcctSeed__Description__c: string
  AcctSeed__Amount__c: number
  AcctSeed__Quantity__c: number
  AcctSeed__Unit_Price__c: number
  [key: string]: unknown
}

export interface AccountingSeedTransaction {
  Id: string
  Name: string
  AcctSeed__Account__c: string
  AcctSeed__Type__c: string
  AcctSeed__Reference__c: string
  AcctSeed__Memo__c: string
  AcctSeed__Payment_Method__c: string
  CurrencyIsoCode: string
  AcctSeed__Sub_Total__c: number
  AcctSeed__Tax_Amount__c: number
  AcctSeed__Total__c: number
  AcctSeed__Contact__c: string
  AcctSeed__Contact_Name__c: string
  AcctSeed__Cash_Receipt_Lines__r?: { records: AccountingSeedTransactionLineItem[] }
  CreatedDate: string
  LastModifiedDate: string
  [key: string]: unknown
}

function mapLineitem(row: AccountingSeedTransactionLineItem): TransactionLineitem {
  return {
    id: row.Id,
    accountId: row.AcctSeed__GL_Account__c || undefined,
    name: row.Name || undefined,
    description: row.AcctSeed__Description__c || undefined,
    unitAmount: row.AcctSeed__Unit_Price__c ?? undefined,
    unitQuantity: row.AcctSeed__Quantity__c ?? undefined,
    totalAmount: row.AcctSeed__Amount__c ?? undefined,
  }
}

export function transformTransaction(raw: AccountingSeedTransaction): Transaction {
  const lines = raw.AcctSeed__Cash_Receipt_Lines__r?.records ?? []
  return {
    id: raw.Id,
    accountId: raw.AcctSeed__Account__c || undefined,
    type: raw.AcctSeed__Type__c || undefined,
    reference: raw.AcctSeed__Reference__c || undefined,
    memo: raw.AcctSeed__Memo__c || undefined,
    paymentMethod: raw.AcctSeed__Payment_Method__c || undefined,
    currency: raw.CurrencyIsoCode || undefined,
    subTotalAmount: raw.AcctSeed__Sub_Total__c ?? undefined,
    taxAmount: raw.AcctSeed__Tax_Amount__c ?? undefined,
    totalAmount: raw.AcctSeed__Total__c ?? undefined,
    contacts:
      raw.AcctSeed__Contact__c
        ? [{ id: raw.AcctSeed__Contact__c, name: raw.AcctSeed__Contact_Name__c || undefined }]
        : undefined,
    lineItems: lines.map(mapLineitem),
    createdAt: raw.CreatedDate ? new Date(raw.CreatedDate) : undefined,
    updatedAt: raw.LastModifiedDate ? new Date(raw.LastModifiedDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
