/**
 * IntaSend invoices (`/api/v1/invoices/`).
 *
 * IntaSend invoices are the underlying payment records (distinct from the
 * "collection request" use in charge.ts). The `/api/v1/invoices/` endpoint
 * lists all invoices against the merchant's account and supports filtering by
 * state, wallet, account, and api_ref. The response shape matches the
 * `RawIntasendInvoice` used in charge.ts.
 *
 * State → InvoiceStatus mapping:
 *   COMPLETE / COMPLETED → paid
 *   PENDING / PROCESSING → open
 *   FAILED / CANCELED    → void
 *   PARTIAL              → open (partial payment received)
 *   RETRY                → open
 *
 * Money: `value` / `net_amount` are major-unit decimals → scaled to minor units.
 *
 * Refs:
 *   https://developers.intasend.com/reference/api_v1_invoices_list
 *   https://developers.intasend.com/docs/payment-status
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import { pickCurrency, strMap, toMinorUnits } from './shared'

export interface RawIntasendInvoiceRecord {
  id?: number | string
  invoice_id?: string
  state?: string | null
  provider?: string | null
  charges?: string | number | null
  net_amount?: string | number | null
  currency?: string | null
  value?: string | number | null
  account?: string | null
  api_ref?: string | null
  host?: string | null
  failed_reason?: string | null
  failed_code?: string | null
  wallet_id?: string | null
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

function mapStatus(state: string | null | undefined): InvoiceStatus {
  switch ((state ?? '').toUpperCase()) {
    case 'COMPLETE':
    case 'COMPLETED':
      return 'paid'
    case 'FAILED':
    case 'CANCELED':
    case 'CANCELLED':
      return 'void'
    case 'PENDING':
    case 'PROCESSING':
    case 'PARTIAL':
    case 'RETRY':
      return 'open'
    default:
      return 'open'
  }
}

export function transformInvoice(raw: RawIntasendInvoiceRecord): Invoice {
  const id = String(raw.invoice_id ?? raw.id ?? '')
  const total = toMinorUnits(raw.value ?? raw.net_amount) ?? 0
  const amountPaid =
    (raw.state ?? '').toUpperCase() === 'COMPLETE' ||
    (raw.state ?? '').toUpperCase() === 'COMPLETED'
      ? total
      : undefined

  return {
    id,
    externalId: id,
    number: id || undefined,
    customerId: undefined,
    subscriptionId: undefined,
    status: mapStatus(raw.state),
    currency: pickCurrency(raw.currency),
    subtotal: total,
    tax: undefined,
    total,
    amountDue: amountPaid != null ? total - amountPaid : total,
    amountPaid,
    amountRemaining: amountPaid != null ? 0 : total,
    dueDate: undefined,
    paidAt:
      amountPaid != null ? toIsoDatetime(raw.updated_at) ?? undefined : undefined,
    periodStart: undefined,
    periodEnd: undefined,
    hostedInvoiceUrl: undefined,
    invoicePdfUrl: undefined,
    lineItemIds: undefined,
    gateway: 'intasend',
    metadata: strMap({
      provider: raw.provider,
      api_ref: raw.api_ref,
      charges: raw.charges,
      wallet_id: raw.wallet_id,
      failed_code: raw.failed_code,
      failed_reason: raw.failed_reason,
      account: raw.account,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
