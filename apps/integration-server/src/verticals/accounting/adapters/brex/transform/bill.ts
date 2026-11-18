/**
 * Transform Brex accounting-record bill entries to the canonical Bill type.
 *
 * Endpoint: GET /v3/accounting/records
 *   Filter:  source_type=BILL  (returns BILL_EXPENSE, BILL_EXPENSE_PAYMENT,
 *                               BILL_EXPENSE_CARD_PAYMENT records)
 *
 * Note: This endpoint is part of the Brex Accounting API (Alpha).
 * Access requires partnership enrollment and the `accounting.readonly` OAuth
 * scope in addition to the standard scopes.
 *
 * Brex AccountingRecordDetailed shape (bill subset):
 * {
 *   id: string
 *   type: "BILL_EXPENSE" | "BILL_EXPENSE_PAYMENT" | "BILL_EXPENSE_CARD_PAYMENT"
 *   source_type?: string              // e.g. "BILL"
 *   source_id?: string               // upstream bill ID in the ERP
 *   review_status?: string           // e.g. "READY_FOR_EXPORT", "EXPORTED"
 *   amount?: { amount: number; currency: string }           // minor units (cents)
 *   original_amount?: { amount: number; currency: string }  // minor units
 *   memo?: string
 *   invoice_number?: string
 *   erp_posting_date?: string        // ISO date
 *   due_at?: string                  // ISO date
 *   posted_at?: string               // ISO timestamp
 *   updated_at?: string              // ISO timestamp
 *   vendor?: { id?: string; name?: string; email?: string; ... }
 *   line_items?: Array<{ ... }>
 * }
 *
 * Amounts are in minor units (cents) per Brex API convention.
 */

import type { Bill } from '../../../schema/bill'

export interface BrexAccountingAmount {
  amount: number
  currency: string
}

export interface BrexAccountingVendor {
  id?: string
  name?: string
  email?: string
  contact_name?: string
}

export interface BrexAccountingRecord {
  id: string
  type?: string
  source_type?: string
  source_id?: string
  review_status?: string
  amount?: BrexAccountingAmount
  original_amount?: BrexAccountingAmount
  memo?: string
  invoice_number?: string
  erp_posting_date?: string
  due_at?: string
  posted_at?: string
  updated_at?: string
  vendor?: BrexAccountingVendor
  line_items?: unknown[]
  [key: string]: unknown
}

export interface BrexAccountingPage {
  items: BrexAccountingRecord[]
  next_cursor?: string | null
}

function toReviewStatus(status: string | undefined): Bill['status'] {
  switch (status) {
    case 'READY_FOR_EXPORT':
      return 'AUTHORIZED'
    case 'EXPORTED':
      return 'PAID'
    case 'NEEDS_REVIEW':
      return 'DRAFT'
    default:
      return undefined
  }
}

export function transformAccountingRecordToBill(raw: BrexAccountingRecord): Bill {
  return {
    id: raw.id,
    status: toReviewStatus(raw.review_status),
    billNumber: raw.invoice_number || undefined,
    contactId: raw.vendor?.id || undefined,
    currency: raw.amount?.currency || raw.original_amount?.currency || undefined,
    totalAmount: raw.amount?.amount ?? undefined,
    notes: raw.memo || undefined,
    postedAt: raw.erp_posting_date
      ? new Date(raw.erp_posting_date)
      : raw.posted_at
        ? new Date(raw.posted_at)
        : undefined,
    dueAt: raw.due_at ? new Date(raw.due_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
