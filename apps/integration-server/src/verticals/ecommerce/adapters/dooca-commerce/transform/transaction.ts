/**
 * Dooca Commerce Payment → canonical Transaction.
 *
 * Dooca Commerce has no dedicated `/transactions` endpoint. Payment data is
 * embedded in the order response under the `payment` object. This transform
 * derives a canonical Transaction record from that embedded object.
 *
 * Relevant payment fields (from GET /orders/:id):
 *   - `id`          — payment record identifier
 *   - `order_id`    — associated order ID
 *   - `gateway_id`  — external gateway reference / authorization code
 *   - `nsu`         — transaction authorization number (fallback auth code)
 *   - `name`        — payment gateway display name
 *   - `method`      — billet | creditcard | manual
 *   - `status`      — approved | pending | paid | denied | expired | refunded | chargeback
 *   - `parcel_price`— instalment amount (major units BRL)
 *   - `parcels`     — number of instalments
 *   - `processed_at`— ISO timestamp when processed
 *   - `created_at`  — ISO timestamp when record was created
 *
 * Docs: https://docs.dooca.com.br/pedido/api
 */

import type { Transaction, TransactionKind, TransactionStatus } from '../../../schema/transaction'
import { majorToMinor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

const CURRENCY = 'BRL'

// ── Raw Dooca shape ───────────────────────────────────────────────────────────

export interface RawDoocaPayment {
  id?: number | string | null
  order_id?: number | string | null
  payment_id?: number | string | null
  gateway_id?: string | null
  name?: string | null
  method?: string | null           // billet | creditcard | manual
  description?: string | null
  external?: string | null
  status?: string | null           // approved | pending | paid | denied | expired | refunded | chargeback
  parcels?: number | null
  parcel_price?: string | number | null
  interest?: string | number | null
  discount?: string | number | null
  token?: string | null
  card_brand?: string | null
  card_bin?: string | null
  card_end?: string | null
  card_cgc?: string | null
  card_owner?: string | null
  card_expiry_date?: string | null
  url?: string | null
  nsu?: string | null
  digitable_line?: string | null
  processed_by?: string | null
  processed_at?: string | null
  expires_at?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

// ── Mapping tables ────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, TransactionStatus> = {
  approved: 'SUCCESS',
  paid: 'SUCCESS',
  pending: 'PENDING',
  denied: 'FAILURE',
  expired: 'FAILURE',
  refunded: 'SUCCESS',
  chargeback: 'FAILURE',
}

// All Dooca payment methods result in a SALE (charge) from the buyer's
// perspective. There is no separate authorization-then-capture flow exposed.
function toKind(_method: string | null | undefined): TransactionKind {
  return 'SALE'
}

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

// ── Transform ─────────────────────────────────────────────────────────────────

/**
 * Transform a Dooca payment object (embedded in an order) into a canonical
 * Transaction. `orderId` should be the string id of the enclosing order when
 * the payment object does not carry `order_id` itself.
 */
export function transformTransaction(raw: RawDoocaPayment, orderId?: string): Transaction {
  const resolvedOrderId =
    orderId ??
    (raw.order_id != null ? String(raw.order_id) : undefined)

  // Derive amount: parcel_price × parcels gives total instalment sum; fall
  // back to any direct total if parcels not present.
  const parcels = raw.parcels ?? 1
  const parcelPrice = toNum(raw.parcel_price)
  const totalMajor = parcelPrice > 0 ? parcelPrice * parcels : 0

  const amount =
    totalMajor > 0
      ? { amount: majorToMinor(totalMajor, CURRENCY), currency: CURRENCY }
      : undefined

  // Authorization code: prefer nsu (Dooca's transaction auth number), fall
  // back to gateway_id.
  const authorizationCode = raw.nsu ?? raw.gateway_id ?? undefined

  const txId =
    raw.id != null
      ? String(raw.id)
      : resolvedOrderId != null
        ? `${resolvedOrderId}-payment`
        : 'unknown'

  return {
    id: txId,
    orderId: resolvedOrderId,
    kind: toKind(raw.method),
    status: raw.status != null ? (STATUS_MAP[raw.status] ?? undefined) : undefined,
    amount,
    gateway: raw.name ?? undefined,
    authorizationCode: authorizationCode ?? undefined,
    processedAt: toIsoDatetime(raw.processed_at ?? undefined) ?? undefined,
    createdAt: toIsoDatetime(raw.created_at ?? undefined) ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
