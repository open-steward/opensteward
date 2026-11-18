import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'
import { toMinorUnits } from './money'

// MineralTree Money object
interface MtMoney {
  amount?: number
  currency?: string
}

// MineralTree bill line-item (expense or product item)
export interface MtBillLineItem {
  id?: string
  externalId?: string
  amount?: MtMoney
  quantity?: number
  unitCost?: MtMoney
  description?: string
  account?: { id?: string }
  [key: string]: unknown
}

export interface MtBill {
  id?: string
  externalId?: string
  invoiceNumber?: string
  vendor?: { id?: string; name?: string }
  amount?: MtMoney
  balance?: MtMoney
  totalTaxAmount?: MtMoney
  dueDate?: string           // yyyy-MM-dd
  transactionDate?: string   // yyyy-MM-dd
  state?: string             // Open | Settled | PendingSettled | ClosedByCredit | Voided
  memo?: string
  expenses?: MtBillLineItem[]
  items?: MtBillLineItem[]
  [key: string]: unknown
}

function mapStatus(state?: string): BillStatus {
  switch ((state ?? '').toLowerCase()) {
    case 'settled': return 'PAID'
    case 'pendingsettled': return 'PARTIALLY_PAID'
    case 'closedbycredit': return 'PAID'
    case 'voided': return 'VOIDED'
    case 'open': return 'AUTHORIZED'
    default: return 'DRAFT'
  }
}

function mapLineItem(li: MtBillLineItem): Lineitem {
  return {
    id: li.id || undefined,
    accountId: li.account?.id || undefined,
    itemDescription: li.description || undefined,
    unitAmount: toMinorUnits(li.unitCost?.amount),
    unitQuantity: li.quantity !== undefined ? Math.round(li.quantity) : undefined,
    totalAmount: toMinorUnits(li.amount?.amount),
  }
}

export function transformBill(raw: MtBill): Bill {
  const lineItems = [
    ...(raw.expenses ?? []).map(mapLineItem),
    ...(raw.items ?? []).map(mapLineItem),
  ]
  return {
    id: raw.id || undefined,
    status: mapStatus(raw.state),
    billNumber: raw.invoiceNumber ?? raw.externalId ?? undefined,
    contactId: raw.vendor?.id || undefined,
    currency: raw.amount?.currency || undefined,
    totalAmount: toMinorUnits(raw.amount?.amount),
    taxAmount: toMinorUnits(raw.totalTaxAmount?.amount),
    balanceAmount: toMinorUnits(raw.balance?.amount),
    notes: raw.memo || undefined,
    lineItems: lineItems.length ? lineItems : undefined,
    postedAt: raw.transactionDate ? new Date(raw.transactionDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
