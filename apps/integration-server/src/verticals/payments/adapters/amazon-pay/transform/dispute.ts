import type { Dispute, DisputeReason, DisputeStatus } from '../../../schema/dispute'
import { toIsoDatetime } from '@opensteward/shared'
import {
  priceCurrency,
  priceMinorUnits,
  strMap,
  type AmazonPayPrice,
} from './shared'

/** Amazon Pay Dispute object — https://developer.amazon.com/docs/amazon-pay-api-v2/dispute.html */
export interface RawAmazonPayDispute {
  disputeId?: string
  chargeId?: string
  disputeType?: string
  disputeAmount?: AmazonPayPrice
  filingReason?: string
  filingTimestamp?: string
  closureTimestamp?: string
  releaseEnvironment?: string
  statusDetails?: {
    state?: string
    reasonCode?: string
    reasonDescription?: string
    resolution?: string
    lastUpdatedTimestamp?: string
  }
  merchantEvidences?: unknown[]
  [k: string]: unknown
}

/** Map Amazon Pay dispute `filingReason` to a canonical DisputeReason. */
function mapReason(raw: RawAmazonPayDispute): DisputeReason | undefined {
  switch ((raw.filingReason ?? '').toLowerCase()) {
    case 'duplicate':
    case 'duplicatecharge':
      return 'duplicate'
    case 'fraudulent':
      return 'fraudulent'
    case 'subscriptioncancelled':
      return 'subscription_cancelled'
    case 'productnotreceived':
      return 'product_not_received'
    case 'productunacceptable':
      return 'product_unacceptable'
    case 'creditnotprocessed':
      return 'credit_not_processed'
    case 'unrecognized':
      return 'unrecognized'
    case 'other':
    case 'overcharged':
    case 'productnolongerneeded':
      return 'other'
    default:
      return undefined
  }
}

/** Map Amazon Pay dispute `statusDetails.state` to a canonical DisputeStatus. */
function mapStatus(raw: RawAmazonPayDispute): DisputeStatus {
  const state = (raw.statusDetails?.state ?? '').toLowerCase()
  const resolution = (raw.statusDetails?.resolution ?? '').toLowerCase()
  switch (state) {
    case 'underreview':
      return 'under_review'
    case 'actionrequired':
      return 'needs_response'
    case 'resolved':
      if (resolution === 'merchantwon') return 'won'
      if (resolution === 'buyerwon') return 'lost'
      return 'won'
    case 'closed':
      if (resolution === 'merchantwon') return 'won'
      if (resolution === 'buyerwon') return 'lost'
      if (resolution === 'nofault') return 'charge_refunded'
      return 'warning_closed'
    default:
      return 'needs_response'
  }
}

export function transformDispute(raw: RawAmazonPayDispute): Dispute {
  return {
    id: String(raw.disputeId ?? ''),
    externalId: String(raw.disputeId ?? ''),
    chargeId: String(raw.chargeId ?? ''),
    amount: priceMinorUnits(raw.disputeAmount) ?? 0,
    currency: priceCurrency(raw.disputeAmount),
    status: mapStatus(raw),
    reason: mapReason(raw),
    evidenceDueBy: undefined,
    network: undefined,
    gateway: 'amazon-pay',
    metadata: strMap({
      disputeType: raw.disputeType,
      filingReason: raw.filingReason,
      reasonCode: raw.statusDetails?.reasonCode,
      resolution: raw.statusDetails?.resolution,
      releaseEnvironment: raw.releaseEnvironment,
    }),
    createdAt: toIsoDatetime(raw.filingTimestamp),
    updatedAt: toIsoDatetime(
      raw.statusDetails?.lastUpdatedTimestamp ?? raw.closureTimestamp,
    ),
    raw,
  }
}
