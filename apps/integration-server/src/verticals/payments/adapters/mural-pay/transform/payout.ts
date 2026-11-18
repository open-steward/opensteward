/**
 * Mural payout → canonical Payout.
 *
 * Source schemas: the embedded OpenAPI of
 * https://developers.muralpay.com/reference/searchpayoutrequests.md —
 * `PayoutRequest` ("payouts": "Information associated with each recipient's
 * payout included in the original payout request.") and
 * `PayoutRequestRecipientInfo` (required: id, createdAt, updatedAt, amount,
 * details, recipientInfo), whose `details` is `FiatPayout` or
 * `BlockchainPayout`.
 *
 * One canonical payout is one recipient payout. Its id joins the payout
 * request id and the recipient payout id, because the only documented read
 * by id is the payout REQUEST (GET /api/payouts/payout/{id}, "Payout request
 * ID"); getPayout splits the id to read it back.
 *
 * Only fiat payouts are representable: a blockchain payout's amount is a
 * token (`"token": { "enum": ["USDC", "USDT"] }`), which is not an ISO 4217
 * currency, and the canonical `currency` is required.
 */
import { majorToMinor } from '@opensteward/shared'
import type { Payout, PayoutStatus } from '../../../schema/payout'

/** `SimpleFiatAmount`: required fiatAmount (number), fiatCurrencyCode. */
export interface RawMuralSimpleFiatAmount {
  fiatAmount: number
  fiatCurrencyCode: string
}

/** `FiatPayout.fiatPayoutStatus`: a oneOf discriminated by `type`. */
export interface RawMuralFiatPayoutStatus {
  type: string
  initiatedAt?: string
  completedAt?: string
  reason?: string
  failureReason?: string
  errorCode?: string
  refundInitiatedAt?: string
  refundCompletedAt?: string
  refundTransactionId?: string
}

export interface RawMuralFiatPayoutDetails {
  type: 'fiat'
  fiatAndRailCode: string
  fiatAmount: RawMuralSimpleFiatAmount
  fiatPayoutStatus: RawMuralFiatPayoutStatus
  [k: string]: unknown
}

export interface RawMuralBlockchainPayoutDetails {
  type: 'blockchain'
  [k: string]: unknown
}

/** `PayoutRequestRecipientInfo`. */
export interface RawMuralPayout {
  id: string
  createdAt: string
  updatedAt: string
  amount: { tokenAmount: number; tokenSymbol: string }
  details: RawMuralFiatPayoutDetails | RawMuralBlockchainPayoutDetails
  recipientInfo?: unknown
}

/** `PayoutRequest`. */
export interface RawMuralPayoutRequest {
  id: string
  createdAt: string
  updatedAt: string
  sourceAccountId: string
  memo?: string
  status: string
  statusV2?: unknown
  transactionHash?: string
  payouts: RawMuralPayout[]
}

/** Separator of the composite id `<payoutRequestId>:<payoutId>`; uuids never contain it. */
export const PAYOUT_ID_SEPARATOR = ':'

/** Whether a recipient payout can be mapped (a fiat payout; see the file comment). */
export function isFiatPayout(
  p: RawMuralPayout,
): p is RawMuralPayout & { details: RawMuralFiatPayoutDetails } {
  return p.details?.type === 'fiat'
}

/**
 * Fiat payout statuses, documented as the `type` of each fiatPayoutStatus
 * variant: "A successful payout will follow these statuses: created → pending
 * → on-hold (optional) → completed. If a payout fails, it will transition to
 * refundInProgress → refunded. A payout can be canceled before initiation,
 * resulting in the canceled status."
 */
function mapStatus(type: string): PayoutStatus {
  switch (type) {
    case 'created':
      return 'pending'
    case 'pending':
    case 'on-hold':
      return 'in_transit'
    case 'completed':
      return 'paid'
    case 'failed':
    case 'refundInProgress':
    case 'refunded':
      return 'failed'
    case 'canceled':
      return 'cancelled'
    default:
      return 'unknown'
  }
}

export function transformPayout(request: RawMuralPayoutRequest, payout: RawMuralPayout): Payout {
  if (!isFiatPayout(payout)) {
    throw new Error(
      `Mural payout ${payout.id} is a ${String(payout.details?.type)} payout: its amount is a token, not an ISO 4217 currency`,
    )
  }
  const { fiatAmount, fiatPayoutStatus } = payout.details
  const currency = fiatAmount.fiatCurrencyCode
  const status = fiatPayoutStatus.type
  const failureMessage =
    status === 'failed' ? fiatPayoutStatus.reason : fiatPayoutStatus.failureReason
  const failed = status === 'failed' || status === 'refundInProgress' || status === 'refunded'
  return {
    id: `${request.id}${PAYOUT_ID_SEPARATOR}${payout.id}`,
    externalId: payout.id,
    amount: majorToMinor(fiatAmount.fiatAmount, currency),
    currency,
    status: mapStatus(status),
    ...(status === 'completed' && fiatPayoutStatus.completedAt
      ? { arrivalDate: fiatPayoutStatus.completedAt }
      : {}),
    ...(failed && fiatPayoutStatus.errorCode ? { failureCode: fiatPayoutStatus.errorCode } : {}),
    ...(failed && failureMessage ? { failureMessage } : {}),
    gateway: 'mural-pay',
    metadata: {},
    createdAt: payout.createdAt,
    updatedAt: payout.updatedAt,
    raw: { payoutRequestId: request.id, ...payout },
  }
}
