/**
 * Mural payin → canonical Charge.
 *
 * Source schema: `Payin` in the embedded OpenAPI of
 * https://developers.muralpay.com/reference/searchpayins.md (required: id,
 * destinationAccountId, payinRail, payinStatus, sourceAmount,
 * settlementStrategy, settlementDetails, fees, createdAt, updatedAt).
 *
 * `sourceAmount` is "The amount sent by the payer, in the source currency",
 * either `PayinFiatAmount` ("currencySymbol": "The ISO 4217 currency code.",
 * "value": "The amount in the smallest unit of the currency, as a string",
 * "exponent": "The number of decimal places used by the smallest unit of the
 * currency.") or `PayinSourceBlockchainAmount` (a USDC/USDT token amount).
 * Only fiat payins are representable: a token is not an ISO 4217 currency,
 * and the canonical `currency` is required.
 */
import { majorToMinor } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'

export interface RawMuralPayinFiatAmount {
  type: 'fiat'
  currencySymbol: string
  exponent: number
  value: string
}

export interface RawMuralPayinBlockchainAmount {
  type: 'blockchain'
  tokenSymbol: string
  exponent: number
  value: string
  blockchain: string
}

/** `Payin.payinStatus`: a oneOf discriminated by `type`. */
export interface RawMuralPayinStatus {
  type: string
  initiatedAt?: string
  completedAt?: string
  reason?: string
  refundedAt?: string
  [k: string]: unknown
}

export interface RawMuralPayin {
  id: string
  destinationAccountId: string
  payinRail: string
  payinStatus: RawMuralPayinStatus
  sourceAmount: RawMuralPayinFiatAmount | RawMuralPayinBlockchainAmount
  createdAt: string
  updatedAt: string
  [k: string]: unknown
}

/** Whether a payin can be mapped (a fiat source amount; see the file comment). */
export function isFiatPayin(
  p: RawMuralPayin,
): p is RawMuralPayin & { sourceAmount: RawMuralPayinFiatAmount } {
  return p.sourceAmount?.type === 'fiat'
}

/**
 * Payin statuses, documented as the `type` of each payinStatus variant:
 * created, canceled, pending, on-hold, completed, failed, refunded.
 */
function mapStatus(type: string): ChargeStatus {
  switch (type) {
    case 'created':
    case 'pending':
    case 'on-hold':
      return 'pending'
    case 'completed':
      return 'succeeded'
    case 'failed':
      return 'failed'
    case 'canceled':
      return 'cancelled'
    case 'refunded':
      return 'refunded'
    default:
      return 'unknown'
  }
}

/** A smallest-unit string at `exponent` decimals → canonical minor units of `currency`. */
function toCanonicalMinor(value: string, exponent: number, currency: string): number {
  const n = Number(value)
  if (!Number.isFinite(n) || !Number.isInteger(exponent) || exponent < 0) {
    throw new Error(`Mural payin amount "${value}" at exponent ${String(exponent)} is not a number`)
  }
  return majorToMinor(n / 10 ** exponent, currency)
}

export function transformCharge(raw: RawMuralPayin): Charge {
  if (!isFiatPayin(raw)) {
    throw Object.assign(
      new Error(
        `Mural payin ${raw.id} has a ${String(raw.sourceAmount?.type)} source amount: a token, not an ISO 4217 currency`,
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }
  const { currencySymbol, exponent, value } = raw.sourceAmount
  const status = raw.payinStatus.type
  return {
    id: raw.id,
    externalId: raw.id,
    amount: toCanonicalMinor(value, exponent, currencySymbol),
    currency: currencySymbol,
    status: mapStatus(status),
    ...(status === 'failed' && raw.payinStatus.reason
      ? { failureMessage: raw.payinStatus.reason }
      : {}),
    gateway: 'mural-pay',
    metadata: {},
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    raw,
  }
}
