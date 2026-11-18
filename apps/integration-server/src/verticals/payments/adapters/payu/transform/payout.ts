import { toIsoDatetime } from '@opensteward/shared'
import type { Payout, PayoutStatus } from '../../../schema/payout'
import { pickCurrency, pickStr, strMap, toMinorUnits } from './shared'

/**
 * A PayU payout as returned by `GET /api/v2_1/payouts/{payoutId}`.
 * PayU payouts are marketplace / platform withdrawals to a bank account;
 * the response is wrapped in a `payout` envelope by some SDK versions but
 * this adapter treats the top-level object directly.
 *
 * Docs: https://developers.payu.com/europe/api/#tag/Payouts/operation/retrievePayout
 */
export interface RawPayuPayout {
  payoutId?: string
  extPayoutId?: string
  amount?: string | number
  description?: string
  status?: string
  /** ISO-8601 timestamp when the payout was created. */
  createdAt?: string
  /** ISO-8601 timestamp of last status update. */
  updatedAt?: string
  /** FX / settlement data — present for multi-currency payouts. */
  fxData?: {
    currencyCode?: string
    amount?: string | number
    rate?: string | number
    partnerId?: string
    tableId?: string
    [k: string]: unknown
  }
  [k: string]: unknown
}

/**
 * Map a PayU payout status to a canonical payout status.
 *   PENDING            → pending
 *   IN_PROGRESS        → in_transit
 *   FINALIZED / DONE   → paid
 *   FAILED             → failed
 *   CANCELED           → cancelled
 */
function mapStatus(raw: RawPayuPayout): PayoutStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'FINALIZED':
    case 'DONE':
      return 'paid'
    case 'IN_PROGRESS':
      return 'in_transit'
    case 'FAILED':
      return 'failed'
    case 'CANCELED':
    case 'CANCELLED':
      return 'cancelled'
    case 'PENDING':
    default:
      return 'pending'
  }
}

export function transformPayout(raw: RawPayuPayout): Payout {
  const id = pickStr(raw.payoutId) ?? pickStr(raw.extPayoutId) ?? ''
  const meta: Record<string, unknown> = {
    extPayoutId: raw.extPayoutId,
    payuStatus: raw.status,
  }
  if (raw.fxData) {
    meta.fxCurrencyCode = raw.fxData.currencyCode
    meta.fxRate = raw.fxData.rate
  }

  return {
    id,
    externalId: pickStr(raw.extPayoutId) ?? id,
    amount: toMinorUnits(raw.amount),
    currency: pickCurrency(raw.fxData?.currencyCode ?? undefined),
    status: mapStatus(raw),
    statementDescriptor: raw.description ?? undefined,
    gateway: 'payu',
    metadata: strMap(meta),
    createdAt: toIsoDatetime(raw.createdAt),
    updatedAt: toIsoDatetime(raw.updatedAt),
    raw,
  }
}
