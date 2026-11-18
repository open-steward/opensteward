import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface CertiniaInvoiceLine {
  Id: string
  Description__c: string
  Quantity__c: number
  Unit_Price__c: number
  Total_Amount__c: number
  Tax_Amount__c: number
  Account_Code__c: string
  [key: string]: unknown
}

export interface CertiniaInvoice {
  Id: string
  Name: string
  Status__c: string
  Invoice_Date__c: string
  Due_Date__c: string
  Amount__c: number
  Tax_Amount__c: number
  Balance__c: number
  Currency__c: string
  Account__c: string
  Lines__r: { records: CertiniaInvoiceLine[] } | null
  [key: string]: unknown
}

function mapStatus(status: string): InvoiceStatus {
  switch (status) {
    case 'Approved':
      return 'AUTHORIZED'
    case 'Paid':
      return 'PAID'
    case 'Cancelled':
      return 'VOIDED'
    case 'Draft':
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: CertiniaInvoiceLine): Lineitem {
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

export function transformInvoice(raw: CertiniaInvoice): Invoice {
  const lines = raw.Lines__r?.records ?? []
  return {
    id: String(raw.Id),
    type: 'INVOICE',
    status: mapStatus(raw.Status__c),
    invoiceNumber: raw.Name || undefined,
    contactId: raw.Account__c || undefined,
    currency: raw.Currency__c || undefined,
    totalAmount: raw.Amount__c,
    taxAmount: raw.Tax_Amount__c || undefined,
    balanceAmount: raw.Balance__c || undefined,
    lineItems: lines.map(mapLineitem),
    postedAt: raw.Invoice_Date__c ? new Date(raw.Invoice_Date__c) : undefined,
    dueAt: raw.Due_Date__c ? new Date(raw.Due_Date__c) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
