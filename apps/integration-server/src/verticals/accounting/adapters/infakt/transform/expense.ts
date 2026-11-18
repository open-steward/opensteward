import type { Expense } from '../../../schema/expense'
import { toIsoDatetime } from '@opensteward/shared'

/**
 * inFakt cost/expense document (GET /documents/costs).
 *
 * inFakt expenses ("costs") are separate from invoices. They represent
 * purchase/cost documents uploaded by the user.
 *
 * Identifier: uuid
 * Amounts: in groszy (1 PLN = 100 groszy).
 */

export interface InfaktCost {
  uuid: string
  issue_date: string | null
  net_price: number | null
  tax_price: number | null
  gross_price: number | null
  client_id: number | null
  currency: string | null
  payment_method: string | null
  note: string | null
  created_at: string | null
  [key: string]: unknown
}

export function transformExpense(raw: InfaktCost): Expense {
  return {
    id: raw.uuid,
    contactId: raw.client_id != null ? String(raw.client_id) : undefined,
    currency: raw.currency || undefined,
    paymentMethod: raw.payment_method || undefined,
    taxAmount: raw.tax_price ?? undefined,
    totalAmount: raw.gross_price ?? undefined,
    postedAt: toIsoDatetime(raw.issue_date) ? new Date(toIsoDatetime(raw.issue_date)!) : undefined,
    createdAt: toIsoDatetime(raw.created_at) ? new Date(toIsoDatetime(raw.created_at)!) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
