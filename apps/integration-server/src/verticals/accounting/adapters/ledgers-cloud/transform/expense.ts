/**
 * LEDGERS.Cloud voucher/expense transform.
 *
 * Endpoints:
 *   GET /v3/list-voucher   — list vouchers (expense records)
 *   GET /v3/view-voucher   — view single voucher
 *
 * Wire fields: id, voucher_number, voucher_date, contact.id / contact_id,
 *   account_id, currency, total_amount, payment_method, items[]
 */

import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface LedgersVoucherItem {
  id?: string | number
  item_id?: string | number
  name?: string
  description?: string
  unit_price?: number
  quantity?: number
  amount?: number
  tax_amount?: number
  account_id?: string | number
  [key: string]: unknown
}

export interface LedgersVoucher {
  id?: string | number
  voucher_number?: string
  voucher_date?: string
  created_at?: string
  updated_at?: string
  contact?: { id?: string | number; contact_id?: string | number }
  contact_id?: string | number
  account_id?: string | number
  currency?: string
  total_amount?: number
  tax_amount?: number
  payment_method?: string
  notes?: string
  items?: LedgersVoucherItem[]
  [key: string]: unknown
}

function mapLines(items: LedgersVoucherItem[]): Lineitem[] {
  return (items ?? []).map((it) => ({
    id: it.id != null ? String(it.id) : undefined,
    itemId: it.item_id != null ? String(it.item_id) : undefined,
    itemName: it.name || undefined,
    itemDescription: it.description || undefined,
    accountId: it.account_id != null ? String(it.account_id) : undefined,
    unitAmount: it.unit_price,
    unitQuantity: it.quantity != null ? Math.round(it.quantity) : undefined,
    taxAmount: it.tax_amount,
    totalAmount: it.amount,
  }))
}

export function transformExpense(raw: LedgersVoucher): Expense {
  const contactId =
    raw.contact?.id ??
    raw.contact?.contact_id ??
    raw.contact_id
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    contactId: contactId != null ? String(contactId) : undefined,
    accountId: raw.account_id != null ? String(raw.account_id) : undefined,
    currency: raw.currency || undefined,
    paymentMethod: raw.payment_method || undefined,
    taxAmount: raw.tax_amount,
    totalAmount: raw.total_amount,
    lineItems: raw.items ? mapLines(raw.items) : undefined,
    postedAt: raw.voucher_date ? new Date(raw.voucher_date) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
