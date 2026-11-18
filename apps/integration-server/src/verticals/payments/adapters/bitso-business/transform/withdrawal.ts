/**
 * Bitso *withdrawal* (outgoing payout / pay-out) → canonical {@link Payout}.
 *
 * A withdrawal moves funds out of the Bitso account to a bank or blockchain
 * destination — a one-to-one match for the canonical `Payout`. Method-specific
 * destination details from the `details` map flow into `metadata`.
 *
 * Transforms never throw: missing optionals collapse to `undefined`.
 */
import type { Payout, PayoutStatus } from '../../../schema/payout'
import { normalizeCurrency, strMap, toMinorUnits } from './shared'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawBitsoWithdrawal {
  wid?: string
  status?: string
  created_at?: string
  currency?: string
  method?: string
  method_name?: string
  amount?: string | number
  asset?: string
  network?: string
  protocol?: string
  integration?: string
  details?: Record<string, unknown>
  [k: string]: unknown
}

function mapStatus(status: string | undefined): PayoutStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'complete':
    case 'completed':
      return 'paid'
    case 'pending':
    case 'processing':
      return 'pending'
    case 'in_progress':
    case 'in_transit':
      return 'in_transit'
    case 'failed':
      return 'failed'
    case 'cancelled':
    case 'canceled':
      return 'cancelled'
    default:
      return 'pending'
  }
}

export function transformWithdrawal(raw: RawBitsoWithdrawal): Payout {
  const currency = normalizeCurrency(raw.currency) ?? 'MXN'
  const id = String(raw.wid ?? '')
  return {
    id,
    externalId: id,
    amount: toMinorUnits(raw.amount, currency) ?? 0,
    currency,
    status: mapStatus(raw.status),
    statementDescriptor: raw.method_name,
    gateway: 'bitso-business',
    metadata: strMap({
      method: raw.method,
      method_name: raw.method_name,
      asset: raw.asset,
      network: raw.network,
      protocol: raw.protocol,
      integration: raw.integration,
      ...(raw.details ?? {}),
    }),
    createdAt: toIsoDatetime(raw.created_at),
    raw,
  }
}
