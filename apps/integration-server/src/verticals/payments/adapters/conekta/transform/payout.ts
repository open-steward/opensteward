/**
 * Conekta `PayoutOrder` — available at `GET /payout_orders`. Each payout order
 * carries an amount, currency, status, and one or more payout line items. We
 * map the payout order itself to the canonical Payout. Amounts are in centavos
 * (minor units already). Timestamps are Unix epoch seconds.
 *
 * Payout order statuses: `pending_payment`, `paid`, `in_progress`, `failed`,
 * `expired`, `canceled`.
 *
 * Refs:
 *   https://developers.conekta.com/reference/getpayoutorders
 *   https://developers.conekta.com/reference/getpayoutorderbyid
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Payout, PayoutStatus } from '../../../schema/payout'
import { pickCurrency, strMap } from './shared'

export interface RawConektaPayoutOrderCustomerInfo {
  id?: string
  name?: string
  email?: string
  [k: string]: unknown
}

export interface RawConektaPayoutItem {
  id?: string
  object?: string
  amount?: number
  currency?: string
  status?: string
  payout_order_id?: string
  livemode?: boolean
  expires_at?: number
  [k: string]: unknown
}

export interface RawConektaPayoutOrder {
  id?: string
  object?: string
  amount?: number
  currency?: string
  status?: string
  reason?: string
  allowed_payout_methods?: string[]
  customer_info?: RawConektaPayoutOrderCustomerInfo
  payouts?: RawConektaPayoutItem[]
  metadata?: Record<string, unknown>
  livemode?: boolean
  created_at?: number
  updated_at?: number
  expires_at?: number
  [k: string]: unknown
}

function mapStatus(raw: RawConektaPayoutOrder): PayoutStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'paid':
      return 'paid'
    case 'in_progress':
    case 'pending_payment':
      return 'in_transit'
    case 'failed':
      return 'failed'
    case 'canceled':
    case 'cancelled':
    case 'expired':
      return 'cancelled'
    default:
      return 'pending'
  }
}

export function transformPayout(raw: RawConektaPayoutOrder): Payout {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    amount: raw.amount ?? 0,
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw),
    arrivalDate: raw.expires_at ? toIsoDatetime(raw.expires_at) : undefined,
    statementDescriptor: raw.reason,
    gateway: 'conekta',
    metadata: strMap(raw.metadata),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
