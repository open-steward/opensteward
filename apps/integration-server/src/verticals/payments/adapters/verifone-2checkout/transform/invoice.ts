/**
 * 2Checkout (Verifone) Invoice → canonical Invoice.
 *
 * 2Checkout issues invoices for subscription billing cycles and one-off
 * charges. The invoice REST 6.0 endpoint (`/invoices/`) returns invoice
 * objects identified by `InvoiceCode`. Money fields follow the standard
 * 2Checkout major-unit decimal convention (e.g. `"99.99"` + `"USD"`).
 *
 * Status mapping:
 *   PAID / COMPLETED  → paid
 *   OPEN / PENDING    → open
 *   PAST_DUE          → open (overdue flag captured in metadata)
 *   REFUNDED          → void
 *   CANCELLED         → void
 *
 * Docs: https://verifone.cloud/docs/2checkout/API-Reference
 */
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import { toIsoDatetime } from '@opensteward/shared'
import { pickCurrency, pickStr, strMap, toMinorUnits } from './shared'

export interface RawVerifone2checkoutInvoice {
  /** Unique invoice identifier. */
  InvoiceCode?: string | number | null
  /** Human-readable invoice number. */
  InvoiceNumber?: string | number | null
  /** Associated subscription reference. */
  SubscriptionReference?: string | null
  /** Customer reference (customerId). */
  CustomerReference?: string | number | null
  /** Invoice lifecycle status. */
  Status?: string | null
  /** ISO-4217 currency code. */
  Currency?: string | null
  /** Subtotal before tax, major-unit decimal. */
  NetPrice?: string | number | null
  /** Tax amount, major-unit decimal. */
  Tax?: string | number | null
  /** Gross total (inc. tax), major-unit decimal. */
  GrossPrice?: string | number | null
  /** Amount paid so far, major-unit decimal. */
  AmountPaid?: string | number | null
  /** Amount remaining, major-unit decimal. */
  AmountDue?: string | number | null
  /** Due date string. */
  DueDate?: string | null
  /** Payment date when status is PAID. */
  PaidDate?: string | null
  /** Invoice creation date. */
  CreatedAt?: string | null
  /** Last update date. */
  UpdatedAt?: string | null
  /** Line items array. */
  Items?: Array<Record<string, unknown>> | null
  [k: string]: unknown
}

function mapStatus(raw: RawVerifone2checkoutInvoice): InvoiceStatus {
  switch ((raw.Status ?? '').toUpperCase()) {
    case 'PAID':
    case 'COMPLETED':
      return 'paid'
    case 'CANCELLED':
    case 'CANCELED':
    case 'REFUNDED':
    case 'REVERSED':
      return 'void'
    case 'UNCOLLECTIBLE':
    case 'CHARGEBACK':
      return 'uncollectible'
    case 'DRAFT':
      return 'draft'
    default:
      return 'open'
  }
}

export function transformInvoice(raw: RawVerifone2checkoutInvoice): Invoice {
  const currency = pickCurrency(raw.Currency)
  const code = String(raw.InvoiceCode ?? raw.InvoiceNumber ?? '')
  return {
    id: code,
    externalId: code,
    number: pickStr(raw.InvoiceNumber),
    customerId: pickStr(raw.CustomerReference),
    subscriptionId: pickStr(raw.SubscriptionReference),
    status: mapStatus(raw),
    currency,
    subtotal: toMinorUnits(raw.NetPrice, currency),
    tax: toMinorUnits(raw.Tax, currency),
    total: toMinorUnits(raw.GrossPrice ?? raw.NetPrice, currency) ?? 0,
    amountDue: toMinorUnits(raw.AmountDue, currency),
    amountPaid: toMinorUnits(raw.AmountPaid, currency),
    dueDate: toIsoDatetime(raw.DueDate),
    paidAt: toIsoDatetime(raw.PaidDate),
    gateway: 'verifone-2checkout',
    metadata: strMap({
      status: raw.Status,
      customerReference: raw.CustomerReference,
    }),
    createdAt: toIsoDatetime(raw.CreatedAt),
    updatedAt: toIsoDatetime(raw.UpdatedAt),
    raw,
  }
}
