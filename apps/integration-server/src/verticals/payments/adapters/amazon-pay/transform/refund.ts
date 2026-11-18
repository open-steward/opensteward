import type { Refund } from '../../../schema/refund'
import { toIsoDatetime } from '@opensteward/shared'
import {
  priceCurrency,
  priceMinorUnits,
  strMap,
  type AmazonPayPrice,
} from './shared'

/** Amazon Pay Refund object — https://developer.amazon.com/docs/amazon-pay-api-v2/refund.html */
export interface RawAmazonPayRefund {
  refundId?: string
  chargeId?: string
  refundAmount?: AmazonPayPrice
  softDescriptor?: string
  statusDetails?: {
    state?: string
    reasonCode?: string
    reasonDescription?: string
    lastUpdatedTimestamp?: string
  }
  creationTimestamp?: string
  releaseEnvironment?: string
  [k: string]: unknown
}

/** Map an Amazon Pay refund `statusDetails.state` to a canonical RefundStatus. */
function mapStatus(raw: RawAmazonPayRefund): Refund['status'] {
  switch ((raw.statusDetails?.state ?? '').toLowerCase()) {
    case 'refunded':
      return 'succeeded'
    case 'refundinitiated':
      return 'pending'
    case 'declined':
      return 'failed'
    default:
      return 'pending'
  }
}

export function transformRefund(raw: RawAmazonPayRefund): Refund {
  return {
    id: String(raw.refundId ?? ''),
    externalId: String(raw.refundId ?? ''),
    chargeId: String(raw.chargeId ?? ''),
    amount: priceMinorUnits(raw.refundAmount) ?? 0,
    currency: priceCurrency(raw.refundAmount),
    status: mapStatus(raw),
    failureReason: raw.statusDetails?.reasonDescription ?? raw.statusDetails?.reasonCode ?? undefined,
    gateway: 'amazon-pay',
    metadata: strMap({
      softDescriptor: raw.softDescriptor,
      reasonCode: raw.statusDetails?.reasonCode,
      state: raw.statusDetails?.state,
      releaseEnvironment: raw.releaseEnvironment,
    }),
    createdAt: toIsoDatetime(raw.creationTimestamp),
    updatedAt: toIsoDatetime(raw.statusDetails?.lastUpdatedTimestamp),
    raw,
  }
}

/** Build the Amazon Pay create-refund request body from a canonical Refund. */
export function buildRefundBody(
  data: Partial<Refund>,
): { chargeId: string; refundAmount: { amount: string; currencyCode: string }; softDescriptor?: string } {
  if (!data.chargeId) throw new Error('chargeId is required to create an Amazon Pay refund.')
  if (data.amount == null) throw new Error('amount is required to create an Amazon Pay refund.')
  if (!data.currency) throw new Error('currency is required to create an Amazon Pay refund.')
  return {
    chargeId: data.chargeId,
    refundAmount: {
      amount: minorUnitsToDecimal(data.amount, data.currency),
      currencyCode: data.currency.toUpperCase(),
    },
  }
}

/**
 * Inverse of `toMinorUnits` — render integer minor units as the decimal string
 * Amazon Pay expects in a Price object (e.g. 1400 + USD → "14.00").
 */
function minorUnitsToDecimal(amount: number, currency: string): string {
  const exponent = exponentForCurrency(currency)
  if (exponent === 0) return String(Math.round(amount))
  return (amount / Math.pow(10, exponent)).toFixed(exponent)
}

function exponentForCurrency(currency: string): number {
  const zeroDecimal = new Set(['JPY', 'KRW', 'ISK', 'CLP', 'VND'])
  const threeDecimal = new Set(['BHD', 'KWD', 'OMR'])
  const code = currency.toUpperCase()
  if (zeroDecimal.has(code)) return 0
  if (threeDecimal.has(code)) return 3
  return 2
}
