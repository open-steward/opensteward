import type { Payout, PayoutStatus } from '../../../schema/payout'
import { type CircleMoney, pickCurrency, strMap, toIsoDatetime, toMinorUnits } from './shared'

/**
 * Circle Mint payout object (`GET /v1/payouts`, `GET /v1/payouts/{id}`). A
 * payout moves funds from a Circle wallet to an external bank or blockchain
 * destination.
 *
 * Docs: https://developers.circle.com/api-reference/circle-mint/payouts/list-payouts
 */
export interface RawCirclePayout {
  id?: string
  sourceWalletId?: string
  destination?: { type?: string; id?: string }
  amount?: CircleMoney
  toAmount?: CircleMoney
  fees?: CircleMoney
  networkFees?: CircleMoney
  status?: string
  externalRef?: string
  errorCode?: string
  riskEvaluation?: { decision?: string; reason?: string }
  createDate?: string
  updateDate?: string
  [k: string]: unknown
}

/** Map a Circle payout `status` onto the canonical {@link PayoutStatus}. */
function mapStatus(raw: RawCirclePayout): PayoutStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'complete':
      return 'paid'
    case 'pending':
      return 'pending'
    case 'failed':
      return 'failed'
    default:
      return 'pending'
  }
}

export function transformPayout(raw: RawCirclePayout): Payout {
  const id = String(raw.id ?? '')
  return {
    id,
    externalId: id,
    amount: toMinorUnits(raw.amount?.amount) ?? 0,
    currency: pickCurrency(raw.amount?.currency),
    status: mapStatus(raw),
    failureCode: raw.errorCode,
    gateway: 'circle',
    metadata: strMap({
      sourceWalletId: raw.sourceWalletId,
      destinationType: raw.destination?.type,
      destinationId: raw.destination?.id,
      externalRef: raw.externalRef,
      fee: raw.fees?.amount,
      networkFee: raw.networkFees?.amount,
    }),
    createdAt: toIsoDatetime(raw.createDate),
    updatedAt: toIsoDatetime(raw.updateDate),
    raw,
  }
}
