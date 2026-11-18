/**
 * Hyperswitch PayoutCreateResponse → canonical Payout.
 *
 * Payouts are exposed via POST /payouts/list (envelope: { size, data, total_count })
 * and GET /payouts/{payout_id}. Amounts are integer minor units.
 *
 * Docs: https://api-reference.hyperswitch.io/v1/payouts/payouts--create
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Payout, PayoutStatus } from '../../../schema/payout'
import { pickCurrency, strMap } from './shared'

export interface RawHyperswitchPayout {
  payout_id?: string
  merchant_id?: string
  merchant_order_reference_id?: string | null
  amount?: number
  currency?: string
  status?: string
  payout_type?: string | null
  connector?: string | null
  merchant_connector_id?: string | null
  connector_transaction_id?: string | null
  customer_id?: string | null
  entity_type?: string | null
  auto_fulfill?: boolean
  recurring?: boolean
  error_code?: string | null
  error_message?: string | null
  unified_code?: string | null
  unified_message?: string | null
  created?: string | null
  profile_id?: string | null
  metadata?: Record<string, unknown> | null
  [k: string]: unknown
}

function mapStatus(raw: RawHyperswitchPayout): PayoutStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'success':
      return 'paid'
    case 'failed':
      return 'failed'
    case 'cancelled':
      return 'cancelled'
    case 'pending':
    case 'initiated':
    case 'requires_creation':
    case 'requires_payout_method_data':
    case 'requires_fulfillment':
    case 'requires_vendor_account_creation':
      return 'pending'
    case 'ineligible':
      return 'failed'
    default:
      return 'pending'
  }
}

export function transformPayout(raw: RawHyperswitchPayout): Payout {
  const id = String(raw.payout_id ?? '')
  return {
    id,
    externalId: id,
    amount: raw.amount ?? 0,
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw),
    failureCode: raw.error_code ?? raw.unified_code ?? undefined,
    failureMessage: raw.error_message ?? raw.unified_message ?? undefined,
    gateway: 'hyperswitch',
    metadata: strMap({
      ...(raw.metadata ?? {}),
      payout_type: raw.payout_type,
      connector: raw.connector,
      merchant_id: raw.merchant_id,
      merchant_connector_id: raw.merchant_connector_id,
      connector_transaction_id: raw.connector_transaction_id,
      customer_id: raw.customer_id,
      entity_type: raw.entity_type,
      profile_id: raw.profile_id,
      auto_fulfill: raw.auto_fulfill,
      recurring: raw.recurring,
    }),
    createdAt: toIsoDatetime(raw.created) ?? undefined,
    raw,
  }
}
