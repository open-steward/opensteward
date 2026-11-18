/**
 * Affirm `Charge` = a single loan disbursement. `Charge.amount` is the loan
 * principal; the installment schedule and APR live on `Charge.raw` only.
 */
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { DEFAULT_CURRENCY, strMap } from './shared'

export interface RawAffirmCharge {
  id?: string
  status?: string
  auth_hold?: boolean
  amount?: number
  amount_refunded?: number
  events?: Array<{ type?: string; created?: string }>
  details?: { order_id?: string; financing_program?: string }
  user?: { email?: string; first_name?: string; last_name?: string }
  created?: string
  [k: string]: unknown
}

function mapStatus(raw: RawAffirmCharge): ChargeStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'authorized':
      return 'pending'
    case 'captured':
      return 'succeeded'
    case 'voided':
      return 'cancelled'
    case 'refunded':
      return 'refunded'
    case 'partially_refunded':
      return 'partially_refunded'
    case 'failed':
      return 'failed'
    default:
      return raw.auth_hold ? 'pending' : 'pending'
  }
}

export function transformCharge(raw: RawAffirmCharge): Charge {
  const name = [raw.user?.first_name, raw.user?.last_name].filter(Boolean).join(' ').trim()
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    amount: raw.amount ?? 0,
    currency: DEFAULT_CURRENCY,
    amountRefunded: raw.amount_refunded,
    status: mapStatus(raw),
    receiptEmail: raw.user?.email,
    description: name || raw.details?.order_id,
    gateway: 'affirm',
    metadata: strMap({
      order_id: raw.details?.order_id,
      financing_program: raw.details?.financing_program,
    }),
    createdAt: raw.created,
    raw,
  }
}
