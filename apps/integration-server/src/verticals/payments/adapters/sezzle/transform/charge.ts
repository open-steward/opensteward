/**
 * Sezzle is order-centric: an **Order** (`GET /v2/order/{uuid}`) carries the
 * amount, currency, customer, and the lifecycle of authorize → capture →
 * refund / release. It maps onto the canonical **Charge**.
 *
 * Money is `{ amount_in_cents, currency }` (integer minor units). The order's
 * lifecycle is read from its sub-objects:
 *   - `intent`            AUTH or CAPTURE
 *   - `checkout_status`   active | complete | denied | deleted
 *   - `authorization`     { approved, captures[], refunds[], releases[] }
 *   - top-level `captures[]`, `refunds[]`, `releases[]` (alternate shape)
 *
 * Canonical status is derived from those: a refunded order is `refunded`
 * (`partially_refunded` when only part is back), a released order is
 * `cancelled`, a denied checkout is `failed`, a captured order is `succeeded`,
 * an approved-but-uncaptured order is `pending`.
 *
 * Docs: https://docs.sezzle.com/docs/api/core/orders/getv2order
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { amountCurrency, amountInCents, pickCurrency, strMap, type SezzleAmount } from './shared'

interface SezzleEvent {
  uuid?: string
  amount?: SezzleAmount
  created_at?: string
  [k: string]: unknown
}

export interface RawSezzleAuthorization {
  approved?: boolean
  authorization_amount?: SezzleAmount
  expiration?: string
  captures?: SezzleEvent[]
  refunds?: SezzleEvent[]
  releases?: SezzleEvent[]
  [k: string]: unknown
}

export interface RawSezzleOrderCustomer {
  uuid?: string
  first_name?: string
  last_name?: string
  email?: string
  phone?: string
  [k: string]: unknown
}

export interface RawSezzleOrder {
  uuid?: string
  reference_id?: string
  order_reference_id?: string
  intent?: string
  description?: string
  checkout_status?: string
  order_amount?: SezzleAmount
  authorization?: RawSezzleAuthorization
  captures?: SezzleEvent[]
  refunds?: SezzleEvent[]
  releases?: SezzleEvent[]
  customer?: RawSezzleOrderCustomer
  sezzle_order_id?: string
  metadata?: Record<string, unknown>
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

function events(raw: RawSezzleOrder, key: 'captures' | 'refunds' | 'releases'): SezzleEvent[] {
  return raw.authorization?.[key] ?? raw[key] ?? []
}

function sumCents(list: SezzleEvent[]): number {
  return list.reduce((acc, e) => acc + amountInCents(e.amount), 0)
}

function mapStatus(raw: RawSezzleOrder): ChargeStatus {
  const total = amountInCents(raw.order_amount)
  const refunded = sumCents(events(raw, 'refunds'))
  const captured = sumCents(events(raw, 'captures'))
  const released = events(raw, 'releases')
  const checkout = (raw.checkout_status ?? '').toLowerCase()
  const approved = raw.authorization?.approved

  if (refunded > 0) {
    return total > 0 && refunded < total ? 'partially_refunded' : 'refunded'
  }
  if (released.length > 0) return 'cancelled'
  if (checkout === 'denied') return 'failed'
  if (checkout === 'deleted') return 'cancelled'
  if (captured > 0) return 'succeeded'
  if (approved === false) return 'failed'
  return 'pending'
}

export function transformCharge(raw: RawSezzleOrder): Charge {
  const total = amountInCents(raw.order_amount)
  const refunded = sumCents(events(raw, 'refunds'))
  const captured = sumCents(events(raw, 'captures'))
  const name = [raw.customer?.first_name, raw.customer?.last_name].filter(Boolean).join(' ').trim()

  return {
    id: String(raw.uuid ?? ''),
    externalId: String(raw.uuid ?? ''),
    amount: total,
    currency: amountCurrency(raw.order_amount),
    amountRefunded: refunded > 0 ? refunded : undefined,
    amountCaptured: captured > 0 ? captured : undefined,
    status: mapStatus(raw),
    captured: captured > 0 ? true : raw.intent === 'CAPTURE' ? true : undefined,
    customerId: raw.customer?.uuid,
    receiptEmail: raw.customer?.email,
    description: raw.description ?? undefined,
    gateway: 'sezzle',
    metadata: strMap({
      ...raw.metadata,
      reference_id: raw.reference_id ?? raw.order_reference_id,
      sezzle_order_id: raw.sezzle_order_id,
      intent: raw.intent,
      checkout_status: raw.checkout_status,
      customer_name: name || undefined,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}

/** Currency of an order, defaulting to USD — used as a refund fallback. */
export function orderCurrency(raw: RawSezzleOrder): string {
  return pickCurrency(raw.order_amount?.currency)
}
