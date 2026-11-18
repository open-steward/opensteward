/**
 * Ramp bill → canonical Bill.
 *
 * Ramp endpoint: GET /developer/v1/bills
 *
 * Ramp bills represent accounts-payable invoices created by the business.
 *
 * Key fields:
 *   id                string
 *   invoice_number    string
 *   vendor            object — { id, remote_name, ... }
 *   amount            object — { amount: number (minor units), currency_code: string }
 *   status            string — DRAFT | PENDING | APPROVED | PAID | REJECTED | ARCHIVED | CANCELLED
 *   issued_at         string — ISO datetime (invoice date)
 *   due_date          string — ISO date
 *   payment           object — { id, payment_date, amount }
 *   created_at        string
 *   updated_at        string
 *   line_items        array  — [{ id, gl_account_id, amount, memo }]
 */

import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface RampBillAmount {
  amount: number
  currency_code: string
}

export interface RampBillVendor {
  id?: string
  remote_name?: string
}

export interface RampBillPayment {
  id?: string
  payment_date?: string
  amount?: RampBillAmount
}

export interface RampBillLineItem {
  id?: string
  gl_account_id?: string
  amount?: number
  memo?: string
}

export interface RampBill {
  id: string
  invoice_number?: string
  vendor?: RampBillVendor
  amount?: RampBillAmount
  status?: string
  issued_at?: string
  due_date?: string
  payment?: RampBillPayment
  line_items?: RampBillLineItem[]
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapStatus(status: string | undefined): BillStatus {
  switch ((status ?? '').toUpperCase()) {
    case 'DRAFT': return 'DRAFT'
    case 'PENDING':
    case 'APPROVED': return 'AUTHORIZED'
    case 'PAID': return 'PAID'
    case 'REJECTED':
    case 'ARCHIVED':
    case 'CANCELLED': return 'VOIDED'
    default: return 'DRAFT'
  }
}

function mapLines(lines: RampBillLineItem[]): Lineitem[] {
  return (lines ?? []).map((l) => ({
    id: l.id || undefined,
    accountId: l.gl_account_id || undefined,
    itemDescription: l.memo || undefined,
    totalAmount: l.amount ?? undefined,
  }))
}

export function transformBill(raw: RampBill): Bill {
  const currency = raw.amount?.currency_code || undefined
  const totalAmount = raw.amount?.amount ?? undefined
  const paidAmount = raw.payment?.amount?.amount ?? undefined

  return {
    id: raw.id,
    status: mapStatus(raw.status),
    billNumber: raw.invoice_number || undefined,
    contactId: raw.vendor?.id || undefined,
    currency,
    totalAmount,
    paidAmount,
    balanceAmount:
      totalAmount !== undefined && paidAmount !== undefined
        ? totalAmount - paidAmount
        : undefined,
    lineItems: raw.line_items ? mapLines(raw.line_items) : undefined,
    postedAt: raw.issued_at ? new Date(raw.issued_at) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    paidAt: raw.payment?.payment_date ? new Date(raw.payment.payment_date) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
