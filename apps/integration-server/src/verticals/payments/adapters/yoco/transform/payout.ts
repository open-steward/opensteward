/**
 * Yoco API `Payout` (GET /v1/payouts/, GET /v1/payouts/{payout_id}) to a
 * canonical Payout. Field names and enums are from the `Payout` schema in
 * https://developer.yoco.com/openapi/yoco-api-reference.json.
 */
import type { Payout, PayoutMethod, PayoutStatus } from '../../../schema/payout'
import { optionalString, readId, readMoney, type RawYocoMoney } from './shared'

export interface RawYocoPayout {
  id: string
  gross_amount?: RawYocoMoney
  net_amount: RawYocoMoney
  fee_amount?: RawYocoMoney
  status?: string
  payout_type?: string
  created_at?: string
  updated_at?: string | null
  [k: string]: unknown
}

/**
 * `PayoutStatus`: `"enum":["failed","paid","sent","unpaid"]`. From
 * https://developer.yoco.com/api-reference/yoco-api/payouts/introduction.md:
 * `sent` "The money request has been sent to the bank"; `unpaid` "The payout
 * failed after it was thought to be successful".
 */
function mapStatus(s: unknown): PayoutStatus {
  switch (s) {
    case 'sent':
      return 'in_transit'
    case 'paid':
      return 'paid'
    case 'failed':
    case 'unpaid':
      return 'failed'
    default:
      return 'unknown'
  }
}

/** `PayoutType`: `"enum":["fast","instant","standard","weekly"]`; only two have a canonical match. */
function mapMethod(t: unknown): PayoutMethod | undefined {
  if (t === 'instant') return 'instant'
  if (t === 'standard') return 'standard'
  if (typeof t === 'string') return 'unknown'
  return undefined
}

export function transformPayout(raw: RawYocoPayout): Payout {
  const id = readId(raw.id, 'payout')
  // The amount that reaches the bank: `net_amount`, "The net proceeds of this
  // payout after any fees & deductions." `gross_amount` stays in `raw`.
  const net = readMoney(raw.net_amount, 'net_amount', id)
  const metadata: Record<string, string> = {}
  if (typeof raw.payout_type === 'string') metadata.payout_type = raw.payout_type
  if (typeof raw.status === 'string') metadata.status = raw.status
  return {
    id,
    externalId: id,
    amount: net.amount,
    currency: net.currency,
    status: mapStatus(raw.status),
    method: mapMethod(raw.payout_type),
    gateway: 'yoco',
    metadata,
    createdAt: optionalString(raw.created_at),
    updatedAt: optionalString(raw.updated_at),
    raw,
  }
}
