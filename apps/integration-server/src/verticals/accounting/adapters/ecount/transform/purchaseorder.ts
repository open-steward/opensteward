import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'
import type { EcountInvoiceItem } from './invoice'

export interface EcountPurchaseOrder {
  ORDER_NO: string
  ORDER_DATE?: string
  DUE_DATE?: string
  CUST_CODE?: string
  CUST_NAME?: string
  TOTAL_AMT?: number
  VAT_AMT?: number
  STATUS?: string
  ITEM_LIST?: EcountInvoiceItem[]
  [key: string]: unknown
}

function mapStatus(status?: string): PurchaseOrderStatus {
  switch (status) {
    case '03':
      return 'COMPLETED'
    case '04':
      return 'CANCELLED'
    default:
      return 'ACTIVE'
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

export function transformPurchaseOrder(raw: EcountPurchaseOrder): PurchaseOrder {
  return {
    id: raw.ORDER_NO,
    status: mapStatus(raw.STATUS),
    contactId: raw.CUST_CODE || undefined,
    totalAmount: raw.TOTAL_AMT ?? 0,
    lineItems: (raw.ITEM_LIST ?? []).map(mapLineitem),
    postedAt: raw.ORDER_DATE ? new Date(raw.ORDER_DATE) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
