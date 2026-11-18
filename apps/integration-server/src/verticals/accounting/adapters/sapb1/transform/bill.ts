/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface SapB1BillLine {
  ItemCode: string
  ItemDescription: string
  Quantity: number
  UnitPrice: number
  LineTotal: number
  VatAmount: number
  AccountCode: string
}

export interface SapB1Bill {
  DocNum: number
  CardCode: string
  DocDate: string
  DocDueDate: string
  DocCurrency: string
  DocTotal: number
  VatSum: number
  PaidToDate: number
  DocStatus: 'O' | 'C'
  Cancelled: 'Y' | 'N'
  DocumentLines?: SapB1BillLine[]
  [key: string]: unknown
}

function mapStatus(raw: SapB1Bill): BillStatus {
  if (raw.Cancelled === 'Y') return 'VOIDED'
  if (raw.DocStatus === 'C') return 'PAID'
  if (raw.PaidToDate > 0) return 'PARTIALLY_PAID'
  return 'AUTHORIZED'
}

function mapLineitem(line: SapB1BillLine): Lineitem {
  return {
    itemId: line.ItemCode || undefined,
    itemDescription: line.ItemDescription || undefined,
    unitAmount: line.UnitPrice,
    unitQuantity: line.Quantity,
    taxAmount: line.VatAmount,
    totalAmount: line.LineTotal,
    accountId: line.AccountCode || undefined,
  }
}

export function transformBill(raw: SapB1Bill): Bill {
  return {
    id: String(raw.DocNum),
    status: mapStatus(raw),
    billNumber: String(raw.DocNum),
    contactId: raw.CardCode || undefined,
    currency: raw.DocCurrency || undefined,
    totalAmount: raw.DocTotal,
    taxAmount: raw.VatSum,
    paidAmount: raw.PaidToDate,
    balanceAmount: raw.DocTotal - raw.PaidToDate,
    lineItems: (raw.DocumentLines ?? []).map(mapLineitem),
    postedAt: raw.DocDate ? new Date(raw.DocDate) : undefined,
    dueAt: raw.DocDueDate ? new Date(raw.DocDueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
