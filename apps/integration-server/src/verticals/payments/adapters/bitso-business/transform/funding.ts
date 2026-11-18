/**
 * Bitso *funding* (incoming deposit / pay-in) → canonical {@link Charge}.
 *
 * A funding is money credited into the Bitso account — the closest canonical
 * resource is a `Charge` (a successful inbound payment). Bitso has no separate
 * "customer" object, so `customerId`/`receiptEmail` stay undefined and any
 * sender details from the method-specific `details` map flow into `metadata`.
 *
 * Transforms never throw: missing optionals collapse to `undefined`.
 */
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { normalizeCurrency, strMap, toMinorUnits } from './shared'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawBitsoFunding {
  fid?: string
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

function mapStatus(status: string | undefined): ChargeStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'complete':
    case 'completed':
      return 'succeeded'
    case 'pending':
    case 'in_progress':
    case 'processing':
      return 'pending'
    case 'failed':
    case 'cancelled':
    case 'canceled':
      return 'failed'
    default:
      return 'pending'
  }
}

export function transformFunding(raw: RawBitsoFunding): Charge {
  const currency = normalizeCurrency(raw.currency) ?? 'MXN'
  const id = String(raw.fid ?? '')
  return {
    id,
    externalId: id,
    amount: toMinorUnits(raw.amount, currency) ?? 0,
    currency,
    status: mapStatus(raw.status),
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
