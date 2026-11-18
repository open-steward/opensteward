import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface CertiniaCreditMemoLine {
  Id: string
  Description__c: string
  Quantity__c: number
  Unit_Price__c: number
  Total_Amount__c: number
  Tax_Amount__c: number
  Account_Code__c: string
  [key: string]: unknown
}

export interface CertiniaCreditMemo {
  Id: string
  Name: string
  Status__c: string
  Credit_Date__c: string
  Amount__c: number
  Tax_Amount__c: number
  Currency__c: string
  Account__c: string
  Lines__r: { records: CertiniaCreditMemoLine[] } | null
  [key: string]: unknown
}

function mapStatus(status: string): CreditMemoStatus {
  switch (status) {
    case 'Approved':
      return 'AUTHORIZED'
    case 'Cancelled':
      return 'VOIDED'
    case 'Draft':
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: CertiniaCreditMemoLine): Lineitem {
  return {
    id: String(line.Id),
    accountId: line.Account_Code__c || undefined,
    itemDescription: line.Description__c || undefined,
    unitAmount: line.Unit_Price__c,
    unitQuantity: line.Quantity__c,
    totalAmount: line.Total_Amount__c,
    taxAmount: line.Tax_Amount__c || undefined,
  }
}

export function transformCreditMemo(raw: CertiniaCreditMemo): CreditMemo {
  const lines = raw.Lines__r?.records ?? []
  return {
    id: String(raw.Id),
    status: mapStatus(raw.Status__c),
    creditmemoNumber: raw.Name || undefined,
    contactId: raw.Account__c || undefined,
    currency: raw.Currency__c || undefined,
    totalAmount: raw.Amount__c,
    taxAmount: raw.Tax_Amount__c || undefined,
    lineItems: lines.map(mapLineitem),
    postedAt: raw.Credit_Date__c ? new Date(raw.Credit_Date__c) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
