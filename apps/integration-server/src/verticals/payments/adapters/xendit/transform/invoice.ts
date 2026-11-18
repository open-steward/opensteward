import { toIsoDatetime } from '@opensteward/shared'
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import { pickCurrency, strMap, toMinorAmount } from './shared'

/**
 * Xendit Invoice object (Invoices API).
 * https://docs.xendit.co/apidocs/invoices  ·  GET /v2/invoices
 *
 * Xendit invoice statuses are PENDING (awaiting payment), PAID / SETTLED
 * (collected), and EXPIRED (past `expiry_date`, no longer payable).
 */
export interface RawXenditInvoice {
  id?: string
  external_id?: string | null
  user_id?: string | null
  status?: 'PENDING' | 'PAID' | 'SETTLED' | 'EXPIRED' | string
  merchant_name?: string | null
  amount?: number
  paid_amount?: number | null
  currency?: string
  payer_email?: string | null
  description?: string | null
  invoice_url?: string | null
  expiry_date?: string | null
  paid_at?: string | null
  customer_id?: string | null
  metadata?: Record<string, unknown> | null
  created?: string | null
  updated?: string | null
  [k: string]: unknown
}

function mapStatus(raw: RawXenditInvoice): InvoiceStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'PAID':
    case 'SETTLED':
      return 'paid'
    case 'EXPIRED':
      return 'void'
    case 'PENDING':
      return 'open'
    default:
      return 'open'
  }
}

export function transformInvoice(raw: RawXenditInvoice): Invoice {
  const total = toMinorAmount(raw.amount)
  const paid = raw.paid_amount != null ? toMinorAmount(raw.paid_amount) : undefined
  return {
    id: String(raw.id ?? raw.external_id ?? ''),
    externalId: String(raw.external_id ?? raw.id ?? ''),
    customerId: raw.customer_id ?? undefined,
    status: mapStatus(raw),
    currency: pickCurrency(raw.currency),
    total,
    amountPaid: paid,
    amountRemaining: paid != null ? Math.max(total - paid, 0) : undefined,
    dueDate: toIsoDatetime(raw.expiry_date),
    paidAt: toIsoDatetime(raw.paid_at),
    hostedInvoiceUrl: raw.invoice_url ?? undefined,
    gateway: 'xendit',
    metadata: strMap({
      ...(raw.metadata ?? {}),
      merchant_name: raw.merchant_name,
      payer_email: raw.payer_email,
      description: raw.description,
    }),
    createdAt: toIsoDatetime(raw.created),
    updatedAt: toIsoDatetime(raw.updated),
    raw,
  }
}
