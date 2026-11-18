import type { Bill } from '../../../schema/bill'
import { nonempty, parseDecimal } from '../../shared/transform'

export interface AccounteerBillLineItem {
  id?: string
  description?: string
  quantity?: number
  unit_price?: number
  amount?: number
  tax_amount?: number
  [key: string]: unknown
}

export interface AccounteerBill {
  id: string
  bill_number?: string
  contact_id?: string
  status?: string
  currency?: string
  subtotal?: number
  tax_amount?: number
  total_amount?: number
  amount_due?: number
  amount_paid?: number
  issue_date?: string
  due_date?: string
  line_items?: AccounteerBillLineItem[]
  [key: string]: unknown
}

function mapStatus(raw?: string): Bill['status'] {
  switch (raw?.toLowerCase()) {
    case 'draft': return 'DRAFT'
    case 'authorised':
    case 'authorized':
    case 'open': return 'AUTHORIZED'
    case 'paid': return 'PAID'
    case 'voided':
    case 'cancelled': return 'VOIDED'
    default: return 'unknown'
  }
}

export function transformBill(raw: AccounteerBill): Bill {
  return {
    id: String(raw.id),
    billNumber: raw.bill_number || undefined,
    contactId: raw.contact_id ? String(raw.contact_id) : undefined,
    status: mapStatus(raw.status),
    currency: raw.currency || undefined,
    taxAmount: parseDecimal(raw.tax_amount),
    totalAmount: parseDecimal(raw.total_amount),
    balanceAmount: parseDecimal(raw.amount_due),
    paidAmount: parseDecimal(raw.amount_paid),
    postedAt: raw.issue_date ? new Date(raw.issue_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    lineItems: nonempty(
      (raw.line_items ?? []).map((li) => ({
        id: li.id ? String(li.id) : undefined,
        itemDescription: li.description || undefined,
        unitQuantity: li.quantity,
        unitAmount: parseDecimal(li.unit_price),
        totalAmount: parseDecimal(li.amount),
        taxAmount: parseDecimal(li.tax_amount),
      })),
    ),
    metadata: raw as Record<string, unknown>,
  }
}
