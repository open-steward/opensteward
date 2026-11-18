/**
 * NOWPayments Invoice → canonical Invoice.
 *
 * NOWPayments exposes a payment invoice creation endpoint at
 * `POST /v1/invoice`. There is no list or get-by-id endpoint for invoices in
 * the public API; only creation is supported.
 *
 * Raw response fields (from the official JS SDK InvoiceReturn interface):
 *   - `id`               — numeric invoice id
 *   - `order_id`         — merchant-supplied order reference
 *   - `order_description`— optional description
 *   - `price_amount`     — total in major units (e.g. 12.50)
 *   - `price_currency`   — ISO 4217 fiat or crypto ticker (e.g. "USD")
 *   - `pay_currency`     — selected pay currency (nullable)
 *   - `ipn_callback_url` — webhook URL
 *   - `invoice_url`      — hosted payment URL
 *   - `success_url`      — redirect on success
 *   - `cancel_url`       — redirect on cancel
 *   - `created_at`       — ISO timestamp
 *   - `updated_at`       — ISO timestamp
 */

import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import { pickCurrency, strMap, toMinorUnits } from './shared'

// ── Raw NOWPayments shape ───────────────────────────────────────────────────

export interface RawNowpaymentsInvoice {
  id?: number | string | null
  order_id?: string | null
  order_description?: string | null
  price_amount?: number | string | null
  price_currency?: string | null
  pay_currency?: string | null
  ipn_callback_url?: string | null
  invoice_url?: string | null
  success_url?: string | null
  cancel_url?: string | null
  is_fixed_rate?: boolean | null
  is_fee_paid_by_user?: boolean | null
  created_at?: string | null
  updated_at?: string | null
  [k: string]: unknown
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function mapStatus(_raw: RawNowpaymentsInvoice): InvoiceStatus {
  // NOWPayments invoices don't carry an explicit status field in the create
  // response. A created invoice is always "open" until payment is received.
  return 'open'
}

// ── Transform ───────────────────────────────────────────────────────────────

export function transformInvoice(raw: RawNowpaymentsInvoice): Invoice {
  const total = toMinorUnits(raw.price_amount)
  const currency = pickCurrency(raw.price_currency ?? undefined, 'USD')

  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    number: raw.order_id ?? undefined,
    status: mapStatus(raw),
    currency,
    total,
    hostedInvoiceUrl: raw.invoice_url ?? undefined,
    gateway: 'nowpayments',
    metadata: strMap({
      order_id: raw.order_id,
      order_description: raw.order_description,
      pay_currency: raw.pay_currency,
      ipn_callback_url: raw.ipn_callback_url,
      success_url: raw.success_url,
      cancel_url: raw.cancel_url,
    }),
    createdAt: raw.created_at ?? undefined,
    updatedAt: raw.updated_at ?? undefined,
    raw,
  }
}
