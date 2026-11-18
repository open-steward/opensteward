/**
 * Drupal Commerce Payment → canonical Transaction.
 *
 * Drupal Commerce ships a `commerce_payment` entity type (the Payment
 * sub-module). It is the closest equivalent to the canonical Transaction.
 *
 * JSON:API path: `/jsonapi/commerce_payment/payment_default`
 *
 * `commerce_payment--payment_default` attributes:
 *   - `amount`                — `{number, currency_code}` object (required)
 *   - `refunded_amount`       — `{number, currency_code}` object (optional)
 *   - `state`                 — workflow state (see mapping below)
 *   - `remote_id`             — string ID on the payment gateway (optional)
 *   - `remote_state`          — raw gateway state string (optional)
 *   - `payment_gateway_mode`  — "test" | "live"
 *   - `authorized`            — Unix timestamp (optional)
 *   - `expires`               — Unix timestamp (optional)
 *   - `completed`             — Unix timestamp (optional)
 *   - `avs_response_code`     — string (optional)
 *
 * Relationships:
 *   - `payment_gateway`       — commerce_payment_gateway entity
 *   - `payment_method`        — commerce_payment_method entity
 *   - `order_id`              — back-link to commerce_order
 *
 * State mapping (commerce_payment default workflow):
 *   new                 → PENDING
 *   authorization       → AUTHORIZATION
 *   authorization_voided → VOID
 *   authorization_expired → VOID
 *   completed           → SALE (captured/settled)
 *   partially_refunded  → REFUND
 *   refunded            → REFUND
 *   failed              → ERROR (no canonical FAILURE? mapped to ERROR)
 *   voided              → VOID
 *
 * Kind mapping:
 *   new / pending             → PENDING (no kind yet)
 *   authorization             → AUTHORIZATION
 *   authorization_voided      → VOID
 *   authorization_expired     → VOID
 *   completed                 → SALE
 *   partially_refunded/refunded → REFUND
 *   failed                    → SALE (attempt)
 */

import type { Transaction, TransactionKind, TransactionStatus } from '../../../schema/transaction'
import type { JsonApiResource } from '../client'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Drupal shapes ─────────────────────────────────────────────────────────

export interface DrupalPaymentPrice {
  number?: string | number
  currency_code?: string
}

export interface DrupalPaymentAttributes {
  amount?: DrupalPaymentPrice | null
  refunded_amount?: DrupalPaymentPrice | null
  state?: string
  remote_id?: string | null
  remote_state?: string | null
  payment_gateway_mode?: string | null
  authorized?: number | string | null
  expires?: number | string | null
  completed?: number | string | null
  avs_response_code?: string | null
  avs_response_code_label?: string | null
  [key: string]: unknown
}

export type DrupalPayment = JsonApiResource & {
  attributes: DrupalPaymentAttributes
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function unixToIso(ts: number | string | null | undefined): string | undefined {
  if (ts == null) return undefined
  const n = typeof ts === 'string' ? parseInt(ts, 10) : ts
  if (!Number.isFinite(n) || n <= 0) return undefined
  return new Date(n * 1000).toISOString()
}

function parsePrice(
  priceField: DrupalPaymentPrice | null | undefined,
): { amount: number; currency: string } | undefined {
  if (!priceField) return undefined
  const numStr = priceField.number
  const major = typeof numStr === 'string' ? parseFloat(numStr) : (typeof numStr === 'number' ? numStr : NaN)
  if (!Number.isFinite(major)) return undefined
  const currency = priceField.currency_code ?? 'USD'
  return { amount: majorToMinor(major, currency), currency }
}

function mapKind(state: string | undefined): TransactionKind | undefined {
  if (!state) return undefined
  switch (state) {
    case 'authorization':
      return 'AUTHORIZATION'
    case 'authorization_voided':
    case 'authorization_expired':
    case 'voided':
      return 'VOID'
    case 'completed':
      return 'SALE'
    case 'partially_refunded':
    case 'refunded':
      return 'REFUND'
    default:
      return undefined
  }
}

function mapStatus(state: string | undefined): TransactionStatus | undefined {
  if (!state) return undefined
  switch (state) {
    case 'new':
      return 'PENDING'
    case 'authorization':
      return 'SUCCESS'
    case 'authorization_voided':
    case 'authorization_expired':
    case 'voided':
      return 'SUCCESS'
    case 'completed':
      return 'SUCCESS'
    case 'partially_refunded':
    case 'refunded':
      return 'SUCCESS'
    case 'failed':
      return 'FAILURE'
    default:
      return 'PENDING'
  }
}

function relationshipId(resource: JsonApiResource, field: string): string | undefined {
  const rel = resource.relationships?.[field]
  if (!rel || !rel.data || Array.isArray(rel.data)) return undefined
  return (rel.data as { id: string }).id
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformTransaction(raw: DrupalPayment): Transaction {
  const attrs = raw.attributes
  const state = attrs.state
  const processedAt = unixToIso(attrs.completed) ?? unixToIso(attrs.authorized)

  return {
    id: raw.id,
    orderId: relationshipId(raw, 'order_id'),
    kind: mapKind(state),
    status: mapStatus(state),
    amount: parsePrice(attrs.amount),
    gateway: relationshipId(raw, 'payment_gateway'),
    authorizationCode: attrs.remote_id ?? undefined,
    parentTransactionId: undefined,
    errorCode: undefined,
    errorMessage: undefined,
    processedAt,
    createdAt: processedAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
