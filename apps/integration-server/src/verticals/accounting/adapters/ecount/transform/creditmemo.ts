import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'
import type { EcountInvoiceItem } from './invoice'

export interface EcountCreditNote {
  SLIP_NO: string
  IO_DATE?: string
  CUST_CODE?: string
  CUST_NAME?: string
  TOTAL_AMT?: number
  VAT_AMT?: number
  STATUS?: string
  ITEM_LIST?: EcountInvoiceItem[]
  [key: string]: unknown
}

function mapStatus(status?: string): CreditMemoStatus {
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

export function transformCreditMemo(raw: EcountCreditNote): CreditMemo {
  return {
    id: raw.SLIP_NO,
    status: mapStatus(raw.STATUS),
    creditmemoNumber: raw.SLIP_NO,
    contactId: raw.CUST_CODE || undefined,
    totalAmount: raw.TOTAL_AMT ?? 0,
    taxAmount: raw.VAT_AMT ?? 0,
    lineItems: (raw.ITEM_LIST ?? []).map(mapLineitem),
    postedAt: raw.IO_DATE ? new Date(raw.IO_DATE) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
