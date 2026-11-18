/**
 * Airwallex Invoice → canonical Invoice.
 *
 * Airwallex Billing invoices live at `/api/v1/invoices`. An invoice is
 * associated with a `billing_customer_id` (the Billing-layer customer, separate
 * from the PA-layer `customer_id`). The status field splits into two dimensions:
 *   - `status`: DRAFT | FINALIZED
 *   - `payment_status`: UNPAID | PAID | PARTIALLY_PAID | VOID | UNCOLLECTIBLE
 *
 * We combine these into the canonical InvoiceStatus. Money amounts (totals) are
 * already in **minor units** (cents) in the Airwallex Billing API — unlike the
 * PaymentIntents layer which uses major units.
 *
 * Refs:
 *   https://www.airwallex.com/docs/api/billing/invoices
 *   https://www.airwallex.com/docs/billing/invoicing/invoices-via-api
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import { pickCurrency, strMap } from './shared'

export interface RawAirwallexInvoiceLineItem {
  id?: string
  description?: string
  quantity?: number
  unit_amount?: number    // minor units
  amount?: number         // minor units (line total)
  currency?: string
  price_id?: string
  product_id?: string
  [k: string]: unknown
}

export interface RawAirwallexInvoice {
  id?: string
  invoice_number?: string
  billing_customer_id?: string
  subscription_id?: string
  currency?: string
  status?: string         // DRAFT | FINALIZED
  payment_status?: string // UNPAID | PAID | PARTIALLY_PAID | VOID | UNCOLLECTIBLE
  subtotal?: number       // minor units
  tax?: number            // minor units
  total?: number          // minor units
  amount_due?: number     // minor units
  amount_paid?: number    // minor units
  amount_remaining?: number // minor units
  due_date?: string
  paid_at?: string
  period_start?: string
  period_end?: string
  hosted_invoice_url?: string
  invoice_pdf_url?: string
  memo?: string
  line_items?: RawAirwallexInvoiceLineItem[]
  created_at?: string
  updated_at?: string
  metadata?: Record<string, unknown>
  [k: string]: unknown
}

function mapStatus(raw: RawAirwallexInvoice): InvoiceStatus {
  const ps = (raw.payment_status ?? '').toUpperCase()
  const s = (raw.status ?? '').toUpperCase()
  if (ps === 'PAID') return 'paid'
  if (ps === 'VOID' || s === 'VOID') return 'void'
  if (ps === 'UNCOLLECTIBLE') return 'uncollectible'
  if (s === 'DRAFT') return 'draft'
  // FINALIZED + UNPAID | PARTIALLY_PAID
  return 'open'
}

export function transformInvoice(raw: RawAirwallexInvoice): Invoice {
  const lineItemIds = (raw.line_items ?? [])
    .map((li) => li.id)
    .filter((id): id is string => id != null)

  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    number: raw.invoice_number ?? undefined,
    customerId: raw.billing_customer_id ?? undefined,
    subscriptionId: raw.subscription_id ?? undefined,
    status: mapStatus(raw),
    currency: pickCurrency(raw.currency),
    // Airwallex Billing amounts are already in minor units (cents)
    subtotal: raw.subtotal != null ? raw.subtotal : undefined,
    tax: raw.tax != null ? raw.tax : undefined,
    total: raw.total ?? 0,
    amountDue: raw.amount_due != null ? raw.amount_due : undefined,
    amountPaid: raw.amount_paid != null ? raw.amount_paid : undefined,
    amountRemaining: raw.amount_remaining != null ? raw.amount_remaining : undefined,
    dueDate: toIsoDatetime(raw.due_date),
    paidAt: toIsoDatetime(raw.paid_at),
    periodStart: toIsoDatetime(raw.period_start),
    periodEnd: toIsoDatetime(raw.period_end),
    hostedInvoiceUrl: raw.hosted_invoice_url ?? undefined,
    invoicePdfUrl: raw.invoice_pdf_url ?? undefined,
    lineItemIds: lineItemIds.length > 0 ? lineItemIds : undefined,
    gateway: 'airwallex',
    metadata: strMap(raw.metadata),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
