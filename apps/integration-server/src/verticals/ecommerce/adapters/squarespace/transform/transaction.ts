/**
 * Squarespace Transaction → canonical Transaction.
 *
 * Squarespace calls transactions "Documents" in the Commerce API. The list
 * endpoint is `GET /1.0/commerce/transactions` and the fetch-by-id endpoint
 * is `GET /1.0/commerce/transactions/{documentIds}`.
 *
 * A Document captures the full financial summary for an order or donation,
 * including payments, refunds, discounts, and processing fees.
 *
 * Docs: https://developers.squarespace.com/commerce-apis/retrieve-all-transactions
 */

import type { Transaction, TransactionKind, TransactionStatus } from '../../../schema/transaction'

// ── Raw shapes ──────────────────────────────────────────────────────────────

export interface RawSquarespaceRefundEntry {
  refundedAmount?: { value?: string; currency?: string }
  refundedOn?: string
  externalTransactionId?: string | null
  [key: string]: unknown
}

export interface RawSquarespacePayment {
  amount?: { value?: string; currency?: string }
  creditCardType?: string | null
  provider?: string | null
  paidOn?: string | null
  externalTransactionId?: string | null
  externalCustomerId?: string | null
  giftCardId?: string | null
  refundedAmount?: { value?: string; currency?: string }
  refunds?: RawSquarespaceRefundEntry[]
  processingFees?: Array<{ amount?: { value?: string; currency?: string } }>
  [key: string]: unknown
}

export interface RawSquarespaceTransaction {
  id: string
  salesOrderId?: string | null
  createdOn?: string | null
  modifiedOn?: string | null
  customerEmail?: string | null
  voided?: boolean
  paymentGatewayError?: string | null
  total?: { value?: string; currency?: string }
  totalSales?: { value?: string; currency?: string }
  totalNetSales?: { value?: string; currency?: string }
  totalTaxes?: { value?: string; currency?: string }
  totalNetPayment?: { value?: string; currency?: string }
  totalNetShipping?: { value?: string; currency?: string }
  payments?: RawSquarespacePayment[]
  discounts?: Array<Record<string, unknown>>
  salesLineItems?: Array<Record<string, unknown>>
  shippingLineItems?: Array<Record<string, unknown>>
  [key: string]: unknown
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function toAmount(v: string | undefined | null): number {
  // Squarespace MoneyValue.value is an integer minor-unit string (cents).
  if (v == null) return 0
  const parsed = parseFloat(v)
  return Number.isNaN(parsed) ? 0 : Math.round(parsed)
}

function toMoney(
  obj: { value?: string; currency?: string } | undefined | null,
  fallbackCurrency: string,
): { amount: number; currency: string } | undefined {
  if (!obj) return undefined
  return {
    amount: toAmount(obj.value),
    currency: obj.currency ?? fallbackCurrency,
  }
}

function mapKind(raw: RawSquarespaceTransaction): TransactionKind | undefined {
  // Squarespace Documents don't have an explicit kind field.
  // Derive from state: voided → VOID, has refunds → REFUND, otherwise SALE.
  if (raw.voided) return 'VOID'
  const payments = raw.payments ?? []
  for (const p of payments) {
    const refunds = p.refunds ?? []
    if (refunds.length > 0 || (p.refundedAmount && toAmount(p.refundedAmount.value) > 0)) {
      return 'REFUND'
    }
  }
  return 'SALE'
}

function mapStatus(raw: RawSquarespaceTransaction): TransactionStatus | undefined {
  if (raw.paymentGatewayError) return 'ERROR'
  if (raw.voided) return 'FAILURE'
  return 'SUCCESS'
}

function pickProvider(payments: RawSquarespacePayment[] | undefined): string | undefined {
  if (!payments || payments.length === 0) return undefined
  return payments[0]?.provider ?? undefined
}

// ── Transform ───────────────────────────────────────────────────────────────

export function transformTransaction(raw: RawSquarespaceTransaction): Transaction {
  const currency = raw.total?.currency ?? raw.totalSales?.currency ?? 'USD'
  return {
    id: raw.id,
    orderId: raw.salesOrderId ?? undefined,
    kind: mapKind(raw),
    status: mapStatus(raw),
    amount: toMoney(raw.total, currency),
    gateway: pickProvider(raw.payments),
    processedAt: raw.payments?.[0]?.paidOn ?? raw.createdOn ?? undefined,
    createdAt: raw.createdOn ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
