/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface DatevCreditMemoLineItem {
  id: string | number
  description: string
  quantity: number
  unit_price: number
  amount: number
  tax_amount: number
  [key: string]: unknown
}

export interface DatevCreditMemo {
  id: string | number
  voucher_number: string
  voucher_date: string
  total_gross_amount: number
  total_tax_amount: number
  open_amount: number
  currency_code: string
  debitor_id: string | number
  voucher_status: string
  line_items: DatevCreditMemoLineItem[]
  [key: string]: unknown
}

function mapStatus(status: string): CreditMemoStatus {
  switch (status) {
    case 'Payed':
      return 'PAID'
    case 'Open':
      return 'AUTHORIZED'
    case 'Cancelled':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: DatevCreditMemoLineItem): Lineitem {
  return {
    id: String(item.id),
    itemDescription: item.description || undefined,
    unitAmount: item.unit_price,
    unitQuantity: item.quantity,
    totalAmount: item.amount,
    taxAmount: item.tax_amount || undefined,
  }
}

export function transformCreditMemo(raw: DatevCreditMemo): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw.voucher_status),
    creditmemoNumber: raw.voucher_number || undefined,
    contactId: raw.debitor_id ? String(raw.debitor_id) : undefined,
    totalAmount: raw.total_gross_amount,
    taxAmount: raw.total_tax_amount,
    balanceAmount: raw.open_amount,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.voucher_date ? new Date(raw.voucher_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
