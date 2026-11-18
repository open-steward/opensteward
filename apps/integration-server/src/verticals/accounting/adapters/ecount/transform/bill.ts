import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'
import type { EcountInvoiceItem } from './invoice'

export interface EcountBill {
  SLIP_NO: string
  IO_DATE?: string
  DUE_DATE?: string
  CUST_CODE?: string
  CUST_NAME?: string
  SUPPLY_AMT?: number
  VAT_AMT?: number
  TOTAL_AMT?: number
  UNPAID_AMT?: number
  STATUS?: string
  CRNC_CODE?: string
  ITEM_LIST?: EcountInvoiceItem[]
  [key: string]: unknown
}

function mapStatus(status?: string): BillStatus {
  switch (status) {
    case '01':
      return 'DRAFT'
    case '02':
      return 'AUTHORIZED'
    case '03':
      return 'PAID'
    case '04':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: EcountInvoiceItem): Lineitem {
  return {
    itemId: item.PROD_CODE || undefined,
    itemDescription: item.PROD_NAME || undefined,
    unitAmount: item.PRICE,
    unitQuantity: item.QTY,
    totalAmount: item.AMOUNT ?? item.SUPPLY_AMT ?? 0,
    taxAmount: item.VAT_AMT || undefined,
    accountId: item.ACCOUNT_CODE || undefined,
  }
}

export function transformBill(raw: EcountBill): Bill {
  return {
    id: raw.SLIP_NO,
    status: mapStatus(raw.STATUS),
    billNumber: raw.SLIP_NO,
    contactId: raw.CUST_CODE || undefined,
    currency: raw.CRNC_CODE || undefined,
    totalAmount: raw.TOTAL_AMT ?? 0,
    taxAmount: raw.VAT_AMT ?? 0,
    balanceAmount: raw.UNPAID_AMT,
    lineItems: (raw.ITEM_LIST ?? []).map(mapLineitem),
    postedAt: raw.IO_DATE ? new Date(raw.IO_DATE) : undefined,
    dueAt: raw.DUE_DATE ? new Date(raw.DUE_DATE) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
