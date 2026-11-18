import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface CertiniaPurchaseOrderLine {
  Id: string
  Description__c: string
  Quantity__c: number
  Unit_Price__c: number
  Total_Amount__c: number
  Tax_Amount__c: number
  Account_Code__c: string
  [key: string]: unknown
}

export interface CertiniaPurchaseOrder {
  Id: string
  Name: string
  Status__c: string
  Order_Date__c: string
  Total_Amount__c: number
  Currency__c: string
  Vendor__c: string
  Lines__r: { records: CertiniaPurchaseOrderLine[] } | null
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  switch (status) {
    case 'Received':
      return 'COMPLETED'
    case 'Cancelled':
      return 'CANCELLED'
    case 'Active':
      return 'ACTIVE'
    case 'Draft':
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: CertiniaPurchaseOrderLine): Lineitem {
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

export function transformPurchaseOrder(raw: CertiniaPurchaseOrder): PurchaseOrder {
  const lines = raw.Lines__r?.records ?? []
  return {
    id: String(raw.Id),
    status: mapStatus(raw.Status__c),
    contactId: raw.Vendor__c || undefined,
    currency: raw.Currency__c || undefined,
    totalAmount: raw.Total_Amount__c,
    lineItems: lines.map(mapLineitem),
    postedAt: raw.Order_Date__c ? new Date(raw.Order_Date__c) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
