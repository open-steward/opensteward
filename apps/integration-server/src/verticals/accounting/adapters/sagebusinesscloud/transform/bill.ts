import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'
import type { SageLineItem } from './invoice'

export interface SageBill {
  id: string
  invoice_number?: string
  date?: string
  due_date?: string
  net_amount?: number
  tax_amount?: number
  total_amount?: number
  outstanding_amount?: number
  status?: { id?: string }
  contact?: { id?: string }
  currency?: { id?: string }
  line_items?: SageLineItem[]
  [key: string]: unknown
}

function mapStatus(status?: string): BillStatus {
  switch (status) {
    case 'DRAFT': return 'DRAFT'
    case 'SUBMITTED': return 'AUTHORIZED'
    case 'AUTHORISED': return 'AUTHORIZED'
    case 'PAID': return 'PAID'
    case 'VOID': return 'VOIDED'
    default: return 'DRAFT'
  }
}

function mapLineitem(item: SageLineItem): Lineitem {
  return {
    id: item.id ? String(item.id) : undefined,
    accountId: item.ledger_account?.id || undefined,
    itemDescription: item.description || undefined,
    unitAmount: item.unit_price,
    unitQuantity: item.quantity,
    totalAmount: item.net_amount ?? 0,
    taxAmount: item.tax_amount || undefined,
  }
}

export function transformBill(raw: SageBill): Bill {
  return {
    id: raw.id,
    billNumber: raw.invoice_number || raw.id,
    status: mapStatus(raw.status?.id),
    contactId: raw.contact?.id || undefined,
    currency: raw.currency?.id || undefined,
    totalAmount: raw.total_amount ?? 0,
    taxAmount: raw.tax_amount ?? 0,
    balanceAmount: raw.outstanding_amount,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
