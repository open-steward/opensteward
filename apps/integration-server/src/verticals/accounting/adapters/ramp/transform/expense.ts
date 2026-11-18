/**
 * Ramp reimbursement → canonical Expense.
 *
 * Ramp endpoint: GET /developer/v1/reimbursements
 *
 * Ramp reimbursements represent out-of-pocket employee expenses submitted
 * for reimbursement, analogous to the canonical Expense type.
 *
 * Key fields:
 *   id              string
 *   amount          object  — { amount: number (minor units), currency_code: string }
 *   merchant_name   string
 *   transaction_date string — ISO date
 *   memo            string
 *   payment         object  — { id, payment_date, amount }
 *   reimbursement_status  string — PENDING | APPROVED | REIMBURSED | REJECTED | DRAFT | CANCELLED
 *   user            object  — { id, first_name, last_name, email }
 *   accounting      object  — { gl_account_id, ... }
 */

import type { Expense } from '../../../schema/expense'

export interface RampReimbursementAmount {
  amount: number
  currency_code: string
}

export interface RampReimbursementUser {
  id?: string
  first_name?: string
  last_name?: string
  email?: string
}

export interface RampReimbursementPayment {
  id?: string
  payment_date?: string
  amount?: RampReimbursementAmount
}

export interface RampReimbursementAccounting {
  gl_account_id?: string
}

export interface RampReimbursement {
  id: string
  amount: RampReimbursementAmount
  merchant_name?: string
  transaction_date?: string
  memo?: string
  reimbursement_status?: string
  user?: RampReimbursementUser
  payment?: RampReimbursementPayment
  accounting?: RampReimbursementAccounting
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformExpense(raw: RampReimbursement): Expense {
  return {
    id: raw.id,
    name: raw.merchant_name || undefined,
    accountId: raw.accounting?.gl_account_id || undefined,
    userId: raw.user?.id || undefined,
    currency: raw.amount?.currency_code || undefined,
    paymentMethod: 'CARD',
    totalAmount: raw.amount?.amount ?? undefined,
    reimbursedAmount: raw.payment?.amount?.amount ?? undefined,
    postedAt: raw.transaction_date ? new Date(raw.transaction_date) : undefined,
    reimbursedAt: raw.payment?.payment_date ? new Date(raw.payment.payment_date) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
