import type { Invoice, InvoiceStatus, InvoiceLineItem } from '../../../schema/invoice'
import { toIsoDatetime } from '@opensteward/shared'
import { amountMinor, pickCurrency, strMap, type TipaltiAmount } from './shared'

/**
 * A Tipalti **invoice** (bill owed to a payee) maps onto the canonical
 * **Invoice**. Money lives under `netAmount` / `taxAmount` / `totalAmount`,
 * each a decimal-major-unit `{ amount, currency }` pair. `payeeId` becomes the
 * canonical `customerId`. Line items live under `lines`.
 */
export interface RawTipaltiInvoiceLine {
  id?: string
  description?: string
  quantity?: number
  amount?: TipaltiAmount
  unitPrice?: TipaltiAmount
  [k: string]: unknown
}

export interface RawTipaltiInvoice {
  id?: string
  refCode?: string
  invoiceNumber?: string
  payeeId?: string
  status?: string
  netAmount?: TipaltiAmount
  taxAmount?: TipaltiAmount
  totalAmount?: TipaltiAmount
  invoiceDate?: string
  dueDate?: string
  creationDate?: string
  lastChangeDateTimeUTC?: string
  description?: string
  lines?: RawTipaltiInvoiceLine[]
  [k: string]: unknown
}

function mapStatus(status: string | undefined): InvoiceStatus {
  switch ((status ?? '').toUpperCase()) {
    case 'PAID':
      return 'paid'
    case 'PENDING_PAYMENT':
    case 'PAYMENT_IN_PROCESS':
    case 'DISPUTED':
      return 'open'
    case 'DELETED':
      return 'void'
    default:
      return 'open'
  }
}

export function transformInvoiceLineItem(
  raw: RawTipaltiInvoiceLine,
  invoiceId: string,
  fallbackCurrency: string,
): InvoiceLineItem {
  const currency = raw.amount?.currency ? pickCurrency(raw.amount.currency) : fallbackCurrency
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    invoiceId,
    description: raw.description,
    quantity: typeof raw.quantity === 'number' ? raw.quantity : undefined,
    unitAmount: raw.unitPrice ? amountMinor(raw.unitPrice) : undefined,
    amount: amountMinor(raw.amount),
    currency,
    metadata: {},
  }
}

export function transformInvoice(raw: RawTipaltiInvoice): Invoice {
  const currency = pickCurrency(raw.totalAmount?.currency ?? raw.netAmount?.currency)
  const status = mapStatus(raw.status)
  const lines = Array.isArray(raw.lines) ? raw.lines : []
  const invoiceId = String(raw.id ?? raw.refCode ?? '')
  return {
    id: invoiceId,
    externalId: String(raw.refCode ?? raw.id ?? ''),
    number: raw.invoiceNumber,
    customerId: raw.payeeId ? String(raw.payeeId) : undefined,
    status,
    currency,
    subtotal: raw.netAmount ? amountMinor(raw.netAmount) : undefined,
    tax: raw.taxAmount ? amountMinor(raw.taxAmount) : undefined,
    total: amountMinor(raw.totalAmount ?? raw.netAmount),
    amountPaid: status === 'paid' ? amountMinor(raw.totalAmount ?? raw.netAmount) : undefined,
    dueDate: toIsoDatetime(raw.dueDate),
    lineItemIds: lines.map((l) => String(l.id ?? '')).filter(Boolean),
    gateway: 'tipalti',
    metadata: strMap({
      status: raw.status,
      description: raw.description,
      invoice_date: raw.invoiceDate,
    }),
    createdAt: toIsoDatetime(raw.creationDate ?? raw.invoiceDate),
    updatedAt: toIsoDatetime(raw.lastChangeDateTimeUTC),
    raw,
  }
}
