import { toCalendarDate } from '../../shared/transform'
import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface ContaAzulCreditMemoItem {
  id: string
  description: string
  quantity: number
  unit_price: number
  total: number
  tax_amount: number
  account_id: string
  product_id: string
  discount: number
  [key: string]: unknown
}

export interface ContaAzulCreditMemo {
  id: string
  number: string
  issue_date: string
  due_date: string
  customer_id: string
  total: number
  tax_total: number
  balance: number
  paid_amount: number
  currency: string
  status: string
  items: ContaAzulCreditMemoItem[]
  [key: string]: unknown
}

function mapStatus(raw: ContaAzulCreditMemo): CreditMemoStatus {
  const s = (raw.status || '').toLowerCase()
  if (s === 'voided' || s === 'cancelled') return 'VOIDED'
  if (s === 'paid' || s === 'liquidated') return 'PAID'
  if (s === 'partially_paid') return 'PARTIALLY_PAID'
  if (s === 'authorized' || s === 'confirmed') return 'AUTHORIZED'
  return 'DRAFT'
}

function mapLineitem(row: ContaAzulCreditMemoItem): Lineitem {
  return {
    id: row.id || undefined,
    accountId: row.account_id || undefined,
    itemId: row.product_id || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.total,
    taxAmount: row.tax_amount || undefined,
    discountAmount: row.discount || undefined,
  }
}

export function transformCreditMemo(raw: ContaAzulCreditMemo): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    creditmemoNumber: raw.number || undefined,
    contactId: raw.customer_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax_total,
    balanceAmount: raw.balance,
    paidAmount: raw.paid_amount || undefined,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.issue_date ? new Date(raw.issue_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCreditMemo(cm: Partial<CreditMemo>): Record<string, unknown> {
  return {
    customer_id: cm.contactId,
    currency: cm.currency,
    issue_date: toCalendarDate(cm.postedAt),
    due_date: toCalendarDate(cm.dueAt),
    items: cm.lineItems?.map((li) => ({
      product_id: li.itemId,
      description: li.itemDescription,
      unit_price: li.unitAmount,
      quantity: li.unitQuantity,
      account_id: li.accountId,
    })),
  }
}
