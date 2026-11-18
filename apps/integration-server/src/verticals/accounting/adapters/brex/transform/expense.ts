/**
 * Transform Brex card expense records to the canonical Expense type.
 *
 * Endpoint: GET /v1/expenses/card, GET /v1/expenses/card/{expense_id}
 *
 * Brex card expense shape:
 * {
 *   id: string
 *   memo?: string
 *   amount?: { amount: number; currency: string }
 *   category?: string                      // e.g. "ADVERTISING_AND_MARKETING", "FOOD", etc.
 *   merchant?: { raw_descriptor?: string }
 *   budget_id?: string
 *   user_id?: string
 *   status?: string                        // e.g. "DRAFT", "SUBMITTED", "APPROVED", "OUT_OF_POLICY"
 *   purchased_at?: string                  // ISO timestamp
 *   updated_at?: string                    // ISO timestamp
 *   receipts?: Array<{ id: string; download_uri?: string; upload_uri?: string }>
 * }
 *
 * Amounts are in minor units (cents).
 */

import type { Expense } from '../../../schema/expense'

export interface BrexReceipt {
  id?: string
  download_uri?: string
}

export interface BrexCardExpense {
  id: string
  memo?: string
  amount?: { amount: number; currency: string }
  category?: string
  merchant?: { raw_descriptor?: string }
  budget_id?: string
  user_id?: string
  status?: string
  purchased_at?: string
  updated_at?: string
  receipts?: BrexReceipt[]
  [key: string]: unknown
}

export function transformExpense(raw: BrexCardExpense): Expense {
  return {
    id: raw.id,
    name: raw.merchant?.raw_descriptor || raw.memo || undefined,
    userId: raw.user_id || undefined,
    currency: raw.amount?.currency || undefined,
    paymentMethod: 'CARD',
    totalAmount: raw.amount?.amount ?? undefined,
    postedAt: raw.purchased_at ? new Date(raw.purchased_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
