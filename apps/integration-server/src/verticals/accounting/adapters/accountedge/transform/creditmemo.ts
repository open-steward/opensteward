/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface AccountEdgeCreditMemo {
  id: string
  credit_memo_number: string
  contact_id: string
  currency: string
  subtotal: number
  tax_amount: number
  total: number
  amount_paid: number
  date: string
  due_date: string
  status: string
  [key: string]: unknown
}

function mapStatus(cm: AccountEdgeCreditMemo): CreditMemoStatus {
  const s = cm.status?.toLowerCase() ?? ''
  if (s === 'void') return 'VOIDED'
  if (s === 'paid') return 'PAID'
  if (s === 'partial') return 'PARTIALLY_PAID'
  if (s === 'approved') return 'AUTHORIZED'
  return 'DRAFT'
}

export function transformCreditMemo(raw: AccountEdgeCreditMemo): CreditMemo {
  return {
    id: raw.id,
    status: mapStatus(raw),
    creditmemoNumber: raw.credit_memo_number || undefined,
    contactId: raw.contact_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax_amount,
    balanceAmount: raw.total - (raw.amount_paid ?? 0),
    paidAmount: raw.amount_paid || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
