import { toCalendarDate } from '../../shared/transform'
import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface HorizonErpCreditMemoLineItem {
  id: string
  name: string
  description: string
  qty: number
  rate: number
  amount: number
  tax_amount: number
  account_id: string
  [key: string]: unknown
}

export interface HorizonErpCreditMemo {
  id: string
  bill_no: string
  bill_date: string
  due_date: string
  taxable_amount: number
  tax_amount: number
  total_amount: number
  due_amount: number
  status: string
  customer_id: string
  currency: string
  line_items: HorizonErpCreditMemoLineItem[]
  [key: string]: unknown
}

function mapStatus(status: string): CreditMemoStatus {
  switch (status) {
    case 'draft': return 'DRAFT'
    case 'open': return 'AUTHORIZED'
    case 'paid': return 'PAID'
    case 'cancelled': return 'VOIDED'
    default: return 'DRAFT'
  }
}

function mapLineitem(item: HorizonErpCreditMemoLineItem): Lineitem {
  return {
    id: String(item.id),
    itemName: item.name || undefined,
    itemDescription: item.description || undefined,
    unitQuantity: item.qty,
    unitAmount: item.rate,
    totalAmount: item.amount,
    taxAmount: item.tax_amount,
    accountId: item.account_id || undefined,
  }
}

export function transformCreditMemo(raw: HorizonErpCreditMemo): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    creditmemoNumber: raw.bill_no || String(raw.id),
    contactId: raw.customer_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.tax_amount,
    balanceAmount: raw.due_amount,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.bill_date ? new Date(raw.bill_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCreditMemo(cm: Partial<CreditMemo>): Record<string, unknown> {
  return {
    customer_id: cm.contactId,
    currency: cm.currency,
    bill_date: toCalendarDate(cm.postedAt),
    due_date: toCalendarDate(cm.dueAt),
    bill_no: cm.creditmemoNumber,
    line_items: cm.lineItems?.map((li) => ({
      name: li.itemName,
      description: li.itemDescription,
      qty: li.unitQuantity,
      rate: li.unitAmount,
      account_id: li.accountId,
    })),
  }
}
