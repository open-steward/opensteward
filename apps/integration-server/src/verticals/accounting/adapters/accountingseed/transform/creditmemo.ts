import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface AccountingSeedCreditMemoLineItem {
  Id: string
  Name: string
  AcctSeed__GL_Account__c: string
  AcctSeed__Product__c: string
  AcctSeed__Product_Name__c: string
  AcctSeed__Unit_Price__c: number
  AcctSeed__Quantity__c: number
  AcctSeed__Amount__c: number
  AcctSeed__Tax_Amount__c: number
  [key: string]: unknown
}

export interface AccountingSeedCreditMemo {
  Id: string
  Name: string
  AcctSeed__Customer__c: string
  AcctSeed__Status__c: string
  AcctSeed__Date__c: string
  AcctSeed__Due_Date__c: string
  CurrencyIsoCode: string
  AcctSeed__Total__c: number
  AcctSeed__Tax__c: number
  AcctSeed__Balance__c: number
  AcctSeed__Paid_Amount__c: number
  AcctSeed__Credit_Memo_Lines__r?: { records: AccountingSeedCreditMemoLineItem[] }
  AcctSeed__Notes__c: string
  CreatedDate: string
  LastModifiedDate: string
  [key: string]: unknown
}

function mapStatus(raw: AccountingSeedCreditMemo): CreditMemoStatus {
  const s = (raw.AcctSeed__Status__c ?? '').toLowerCase()
  if (s === 'voided' || s === 'void') return 'VOIDED'
  if (s === 'deleted') return 'DELETED'
  if (s === 'paid' || s === 'closed') return 'PAID'
  if (s === 'partially paid') return 'PARTIALLY_PAID'
  if (s === 'authorized' || s === 'approved' || s === 'posted') return 'AUTHORIZED'
  return 'DRAFT'
}

function mapLineitem(row: AccountingSeedCreditMemoLineItem): Lineitem {
  return {
    id: row.Id,
    accountId: row.AcctSeed__GL_Account__c || undefined,
    itemId: row.AcctSeed__Product__c || undefined,
    itemName: row.AcctSeed__Product_Name__c || undefined,
    unitAmount: row.AcctSeed__Unit_Price__c ?? undefined,
    unitQuantity: row.AcctSeed__Quantity__c ?? undefined,
    totalAmount: row.AcctSeed__Amount__c ?? undefined,
    taxAmount: row.AcctSeed__Tax_Amount__c ?? undefined,
  }
}

export function transformCreditMemo(raw: AccountingSeedCreditMemo): CreditMemo {
  const lines = raw.AcctSeed__Credit_Memo_Lines__r?.records ?? []
  return {
    id: raw.Id,
    status: mapStatus(raw),
    creditmemoNumber: raw.Name || undefined,
    contactId: raw.AcctSeed__Customer__c || undefined,
    currency: raw.CurrencyIsoCode || undefined,
    totalAmount: raw.AcctSeed__Total__c ?? undefined,
    taxAmount: raw.AcctSeed__Tax__c ?? undefined,
    paidAmount: raw.AcctSeed__Paid_Amount__c ?? undefined,
    balanceAmount: raw.AcctSeed__Balance__c ?? undefined,
    notes: raw.AcctSeed__Notes__c || undefined,
    lineItems: lines.map(mapLineitem),
    postedAt: raw.AcctSeed__Date__c ? new Date(raw.AcctSeed__Date__c) : undefined,
    dueAt: raw.AcctSeed__Due_Date__c ? new Date(raw.AcctSeed__Due_Date__c) : undefined,
    createdAt: raw.CreatedDate ? new Date(raw.CreatedDate) : undefined,
    updatedAt: raw.LastModifiedDate ? new Date(raw.LastModifiedDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
