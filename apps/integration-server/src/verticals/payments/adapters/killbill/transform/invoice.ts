import { toIsoDatetime } from '@opensteward/shared'
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import { requireCurrency, requireId, str, toMinor } from './shared'

/**
 * Invoice resource (https://killbill.github.io/slate/invoice.html, "Invoice
 * Resource"): invoiceId, accountId, amount ("Sum of all item amounts"),
 * currency, status ("DRAFT, COMMITTED or VOID"), invoiceDate, invoiceNumber,
 * balance ("amount that a customer owes as part of an invoice").
 *
 * Read from GET /1.0/kb/invoices/{invoiceId} only: the list endpoint returns
 * "shallow objects and thus the value 0 is returned for the amount, creditAdj,
 * refundAdj and balance fields".
 */
export interface RawKillbillInvoice {
  invoiceId?: string
  accountId?: string | null
  amount?: number | null
  currency?: string | null
  status?: string | null
  invoiceDate?: string | null
  targetDate?: string | null
  invoiceNumber?: string | number | null
  balance?: number | null
  [k: string]: unknown
}

function mapStatus(status: unknown, balance: number | undefined): InvoiceStatus {
  switch (status) {
    case 'DRAFT':
      return 'draft'
    case 'VOID':
      return 'void'
    case 'COMMITTED':
      if (balance === undefined) return 'unknown'
      return balance > 0 ? 'open' : 'paid'
    default:
      return 'unknown'
  }
}

export function transformInvoice(raw: RawKillbillInvoice): Invoice {
  const id = requireId(raw.invoiceId, 'invoiceId', 'invoice')
  const currency = requireCurrency(raw.currency, 'invoice')
  const total = toMinor(raw.amount, currency)
  if (total === undefined) throw new Error(`Kill Bill invoice ${id} has no amount`)
  const balance = toMinor(raw.balance, currency)
  const number =
    typeof raw.invoiceNumber === 'number' ? String(raw.invoiceNumber) : str(raw.invoiceNumber)
  return {
    id,
    externalId: id,
    ...(number ? { number } : {}),
    ...(str(raw.accountId) ? { customerId: raw.accountId as string } : {}),
    status: mapStatus(raw.status, balance),
    currency,
    total,
    ...(balance !== undefined ? { amountDue: balance, amountRemaining: balance } : {}),
    gateway: 'killbill',
    metadata: {},
    createdAt: toIsoDatetime(raw.invoiceDate),
    raw,
  }
}
