/**
 * Ramp card transaction → canonical Transaction.
 *
 * Ramp endpoint: GET /developer/v1/transactions
 *
 * Key Ramp transaction fields:
 *   id              string  — UUID
 *   amount          object  — { amount: number (minor units), currency_code: string }
 *   merchant_name   string
 *   sk_category_name string — Ramp spend category name
 *   card_holder     object  — { first_name, last_name, department_name, location_name }
 *   accounting_date string  — ISO date of accounting record
 *   user_transaction_time string — ISO datetime the card was swiped
 *   memo            string
 *   sync_status     string  — READY_TO_SYNC | SYNCED | DELETED
 *   policy_violations array
 *   card_id         string
 *   currency_code   string  (top-level, same as amount.currency_code)
 */

import type { Transaction, TransactionContact } from '../../../schema/transaction'

export interface RampTransactionAmount {
  amount: number
  currency_code: string
}

export interface RampCardHolder {
  first_name?: string
  last_name?: string
  department_name?: string
  location_name?: string
  user_id?: string
}

export interface RampTransaction {
  id: string
  amount: RampTransactionAmount
  currency_code?: string
  merchant_name?: string
  sk_category_name?: string
  merchant_id?: string
  card_holder?: RampCardHolder
  card_id?: string
  accounting_date?: string
  user_transaction_time?: string
  memo?: string
  sync_status?: string
  [key: string]: unknown
}

export function transformTransaction(raw: RampTransaction): Transaction {
  const contacts: TransactionContact[] = []
  if (raw.card_holder?.user_id) {
    contacts.push({
      id: raw.card_holder.user_id,
      name:
        [raw.card_holder.first_name, raw.card_holder.last_name].filter(Boolean).join(' ') ||
        undefined,
    })
  }

  return {
    id: raw.id,
    type: 'PAYMENT',
    memo: raw.memo || undefined,
    currency: raw.amount?.currency_code || raw.currency_code || undefined,
    totalAmount: raw.amount?.amount ?? undefined,
    contacts: contacts.length > 0 ? contacts : undefined,
    createdAt: raw.user_transaction_time ? new Date(raw.user_transaction_time) : undefined,
    updatedAt: raw.accounting_date ? new Date(raw.accounting_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
