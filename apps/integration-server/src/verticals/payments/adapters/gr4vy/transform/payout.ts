import type { Payout, PayoutStatus } from '../../../schema/payout'
import { toIsoDatetime } from '@opensteward/shared'
import { pickCurrency, pickStr, strMap } from './shared'

/**
 * A Gr4vy *payout* maps to a canonical Payout. Amounts are integer minor
 * units. The API exposes `GET /payouts` (list) and `GET /payouts/{payout_id}`.
 *
 * Docs: https://docs.gr4vy.com/reference/payouts/list-payouts
 *       https://docs.gr4vy.com/reference/payouts/get-payout
 */
export interface RawGr4vyPayout {
  id?: string | null
  type?: string
  amount?: number
  currency?: string
  status?: string
  external_identifier?: string | null
  merchant_account_id?: string | null
  payment_service_payout_id?: string | null
  category?: string | null
  buyer?: { id?: string; external_identifier?: string; display_name?: string } | null
  payment_method?: { id?: string; method?: string; scheme?: string; label?: string } | null
  payment_service?: { id?: string; payment_service_definition_id?: string; display_name?: string } | null
  merchant?: { name?: string; statement_descriptor?: string | null } | null
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

function mapStatus(status: string | undefined): PayoutStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'succeeded':
      return 'paid'
    case 'pending':
      return 'pending'
    case 'failed':
      return 'failed'
    case 'declined':
      return 'failed'
    default:
      return 'pending'
  }
}

export function transformPayout(raw: RawGr4vyPayout): Payout {
  return {
    id: String(raw.id ?? ''),
    externalId: pickStr(raw.external_identifier) ?? String(raw.id ?? ''),
    amount: raw.amount ?? 0,
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw.status),
    statementDescriptor: pickStr(raw.merchant?.statement_descriptor),
    gateway: 'gr4vy',
    metadata: strMap({
      merchant_account_id: raw.merchant_account_id,
      payment_service_payout_id: raw.payment_service_payout_id,
      category: raw.category,
      buyer_id: raw.buyer?.id,
      payment_service_definition_id: raw.payment_service?.payment_service_definition_id,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
