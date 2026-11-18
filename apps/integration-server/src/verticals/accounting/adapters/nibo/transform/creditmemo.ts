import { toCalendarDate } from '../../shared/transform'
import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface NiboCreditMemoItem {
  itemId: number
  productCode: string
  description: string
  unitPrice: number
  quantity: number
  totalValue: number
  taxValue: number
  accountCode: string
  discountValue: number
  [key: string]: unknown
}

export interface NiboCreditMemo {
  creditMemoId: number
  documentNumber: string
  customerId: number
  issueDate: string
  dueDate: string
  totalValue: number
  taxValue: number
  balance: number
  paidValue: number
  currencyCode: string
  status: string
  isCancelled: boolean
  items: NiboCreditMemoItem[]
  [key: string]: unknown
}

function mapStatus(raw: NiboCreditMemo): CreditMemoStatus {
  if (raw.isCancelled) return 'VOIDED'
  if (raw.status === 'Paid' || raw.balance === 0) return 'PAID'
  if (raw.paidValue > 0 && raw.balance > 0) return 'PARTIALLY_PAID'
  if (raw.status === 'Authorized') return 'AUTHORIZED'
  return 'DRAFT'
}

function mapLineitem(row: NiboCreditMemoItem): Lineitem {
  return {
    id: String(row.itemId),
    accountId: row.accountCode || undefined,
    itemId: row.productCode || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unitPrice,
    unitQuantity: row.quantity,
    totalAmount: row.totalValue,
    taxAmount: row.taxValue || undefined,
    discountAmount: row.discountValue || undefined,
  }
}

export function transformCreditMemo(raw: NiboCreditMemo): CreditMemo {
  return {
    id: String(raw.creditMemoId),
    status: mapStatus(raw),
    creditmemoNumber: raw.documentNumber || undefined,
    contactId: raw.customerId ? String(raw.customerId) : undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: raw.totalValue,
    taxAmount: raw.taxValue,
    balanceAmount: raw.balance,
    paidAmount: raw.paidValue || undefined,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.issueDate ? new Date(raw.issueDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCreditMemo(cm: Partial<CreditMemo>): Record<string, unknown> {
  return {
    customerId: cm.contactId ? Number(cm.contactId) : undefined,
    currencyCode: cm.currency,
    issueDate: toCalendarDate(cm.postedAt),
    dueDate: toCalendarDate(cm.dueAt),
    items: cm.lineItems?.map((li) => ({
      productCode: li.itemId,
      description: li.itemDescription,
      unitPrice: li.unitAmount,
      quantity: li.unitQuantity,
      accountCode: li.accountId,
    })),
  }
}
