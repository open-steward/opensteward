/**
 * A2X Settlement → canonical Invoice transform.
 *
 * In A2X a "settlement" is a summarised ecommerce payout period
 * (e.g. an Amazon settlement or a Shopify payout). A2X groups raw
 * marketplace transactions into a settlement summary and posts it to
 * the connected accounting system as a journal / invoice.
 *
 * A2X REST settlement shape:
 * {
 *   id:               number
 *   status:           "not_sent" | "sending" | "sent" | "failed" | "approved"
 *   settlement_start: string   (ISO-8601 date)
 *   settlement_end:   string   (ISO-8601 date)
 *   settlement_id:    string   (marketplace reference)
 *   currency:         string   (ISO-4217)
 *   total:            number
 *   total_tax?:       number
 *   total_fees?:      number
 *   lines?: Array<{
 *     id:           number
 *     description:  string
 *     account_code: string
 *     amount:       number
 *     tax_amount:   number
 *   }>
 *   posted_at:        string | null
 *   created_at:       string
 *   updated_at:       string
 * }
 */

import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface A2xSettlementLine {
  id: number
  description: string
  account_code: string
  amount: number
  tax_amount: number
  [key: string]: unknown
}

export interface A2xSettlement {
  id: number
  status: string
  settlement_start: string
  settlement_end: string
  settlement_id: string
  currency: string
  total: number
  total_tax?: number
  total_fees?: number
  lines?: A2xSettlementLine[]
  posted_at: string | null
  created_at: string
  updated_at: string
  [key: string]: unknown
}

function mapStatus(raw: A2xSettlement): InvoiceStatus {
  switch (raw.status) {
    case 'approved':
    case 'sent':
      return 'PAID'
    case 'sending':
      return 'SUBMITTED'
    case 'failed':
    case 'not_sent':
    default:
      return 'DRAFT'
  }
}

/** Convert a decimal major-unit amount (e.g. 19.99) to integer minor units (e.g. 1999 cents). */
function toMinorUnits(value: number): number {
  return Math.round(value * 100)
}

function mapLines(lines: A2xSettlementLine[] | undefined): Lineitem[] {
  if (!lines) return []
  return lines.map((l) => ({
    id: String(l.id),
    itemDescription: l.description || undefined,
    accountId: l.account_code || undefined,
    totalAmount: toMinorUnits(l.amount),
    taxAmount: l.tax_amount != null ? toMinorUnits(l.tax_amount) : undefined,
  }))
}

export function transformSettlementToInvoice(raw: A2xSettlement): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.settlement_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: toMinorUnits(raw.total),
    taxAmount: raw.total_tax != null ? toMinorUnits(raw.total_tax) : undefined,
    lineItems: mapLines(raw.lines),
    postedAt: raw.settlement_start ? new Date(raw.settlement_start) : undefined,
    dueAt: raw.settlement_end ? new Date(raw.settlement_end) : undefined,
    paidAt: raw.posted_at ? new Date(raw.posted_at) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
