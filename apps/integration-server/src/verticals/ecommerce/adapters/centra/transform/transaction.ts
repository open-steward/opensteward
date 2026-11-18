/**
 * Centra Order API Payment Transaction → canonical Transaction.
 *
 * Centra surfaces payment data on orders under fields like:
 *  - `paymentPlugin`      — gateway name (e.g. "Klarna", "Stripe")
 *  - `paymentType`        — payment method type
 *  - `paymentDescription` — human-readable description
 *  - `paymentReference`   — external payment reference / auth code
 *
 * Centra does not expose a standalone transaction resource in the Order API
 * (the GraphQL Integration API does). We synthesise a Transaction from the
 * order payment fields so the canonical `listTransactions` / `getTransaction`
 * interface can return something useful.
 *
 * The synthesised id is `orderId:payment` so it is stable and unique per order.
 *
 * Docs: https://centra.dev/docs/apis/order-api/api-reference
 */

import type { Transaction, TransactionStatus } from '../../../schema/transaction'
import { majorToMinor } from '../../../schema/shared'

export interface RawCentraOrderPayment {
  /** Synthetic id — we attach this when building from an order object. */
  orderId: number | string
  paymentPlugin?: string | null
  paymentType?: string | null
  paymentDescription?: string | null
  paymentReference?: string | null
  /** Total paid amount (major units). */
  grandTotalValue?: string | number
  currency?: string
  /** Centra capture status: 'yes' | 'no'. */
  shouldCapture?: boolean
  [key: string]: unknown
}

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapStatus(shouldCapture: boolean | undefined): TransactionStatus | undefined {
  if (shouldCapture === true) return 'PENDING'
  if (shouldCapture === false) return 'SUCCESS'
  return undefined
}

export function transformTransaction(raw: RawCentraOrderPayment): Transaction {
  const currency = raw.currency ?? 'USD'
  const orderId = String(raw.orderId)
  return {
    id: `${orderId}:payment`,
    orderId,
    kind: raw.shouldCapture ? 'AUTHORIZATION' : 'CAPTURE',
    status: mapStatus(raw.shouldCapture),
    amount:
      raw.grandTotalValue != null
        ? { amount: majorToMinor(toNum(raw.grandTotalValue), currency), currency }
        : undefined,
    gateway: raw.paymentPlugin ?? undefined,
    authorizationCode: raw.paymentReference ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformTransaction(
  transaction: Partial<Transaction>,
): Record<string, unknown> {
  return {
    paymentPlugin: transaction.gateway,
    paymentReference: transaction.authorizationCode,
  }
}
