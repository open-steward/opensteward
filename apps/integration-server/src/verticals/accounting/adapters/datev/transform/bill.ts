/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface DatevBillLineItem {
  id: string | number
  description: string
  quantity: number
  unit_price: number
  amount: number
  tax_amount: number
  account_number: string
  [key: string]: unknown
}

export interface DatevBill {
  id: string | number
  voucher_number: string
  voucher_date: string
  due_date: string
  total_gross_amount: number
  total_tax_amount: number
  total_net_amount: number
  open_amount: number
  currency_code: string
  creditor_id: string | number
  voucher_status: string
  line_items: DatevBillLineItem[]
  [key: string]: unknown
}

function mapStatus(status: string): BillStatus {
  switch (status) {
    case 'Payed':
      return 'PAID'
    case 'Open':
      return 'AUTHORIZED'
    case 'Cancelled':
      return 'VOIDED'
    case 'Overdue':
      return 'OVERDUE'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: DatevBillLineItem): Lineitem {
  return {
    id: String(item.id),
    itemDescription: item.description || undefined,
    unitAmount: item.unit_price,
    unitQuantity: item.quantity,
    totalAmount: item.amount,
    taxAmount: item.tax_amount || undefined,
  }
}

export function transformBill(raw: DatevBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw.voucher_status),
    billNumber: raw.voucher_number || undefined,
    contactId: raw.creditor_id ? String(raw.creditor_id) : undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.total_gross_amount,
    taxAmount: raw.total_tax_amount,
    balanceAmount: raw.open_amount,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.voucher_date ? new Date(raw.voucher_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
