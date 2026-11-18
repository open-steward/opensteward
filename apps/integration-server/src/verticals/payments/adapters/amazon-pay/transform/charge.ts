import type { Charge, ChargeStatus } from '../../../schema/charge'
import { toIsoDatetime } from '@opensteward/shared'
import {
  priceCurrency,
  priceMinorUnits,
  strMap,
  type AmazonPayPrice,
} from './shared'

interface AmazonPayStatusDetails {
  state?: string
  reasonCode?: string
  reasonDescription?: string
  lastUpdatedTimestamp?: string
}

interface AmazonPayMerchantMetadata {
  merchantReferenceId?: string
  merchantStoreName?: string
  noteToBuyer?: string
  customInformation?: string
}

/** Amazon Pay Charge object — https://developer.amazon.com/docs/amazon-pay-api-v2/charge.html */
export interface RawAmazonPayCharge {
  chargeId?: string
  chargePermissionId?: string
  chargeAmount?: AmazonPayPrice
  captureAmount?: AmazonPayPrice
  refundedAmount?: AmazonPayPrice
  softDescriptor?: string
  captureNow?: boolean
  merchantMetadata?: AmazonPayMerchantMetadata
  providerMetadata?: { providerReferenceId?: string }
  statusDetails?: AmazonPayStatusDetails
  creationTimestamp?: string
  expirationTimestamp?: string
  releaseEnvironment?: string
  [k: string]: unknown
}

/** Map an Amazon Pay charge `statusDetails.state` to a canonical ChargeStatus. */
function mapStatus(raw: RawAmazonPayCharge): ChargeStatus {
  switch ((raw.statusDetails?.state ?? '').toLowerCase()) {
    case 'captured':
      return 'succeeded'
    case 'authorized':
    case 'authorizationinitiated':
    case 'captureinitiated':
      return 'pending'
    case 'declined':
      return 'failed'
    case 'canceled':
    case 'cancelled':
      return 'cancelled'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawAmazonPayCharge): Charge {
  const currency = priceCurrency(raw.chargeAmount ?? raw.captureAmount)
  const reason = raw.statusDetails?.reasonDescription ?? raw.statusDetails?.reasonCode
  return {
    id: String(raw.chargeId ?? ''),
    externalId: String(raw.chargeId ?? ''),
    amount: priceMinorUnits(raw.chargeAmount) ?? 0,
    currency,
    amountCaptured: priceMinorUnits(raw.captureAmount),
    amountRefunded: priceMinorUnits(raw.refundedAmount),
    status: mapStatus(raw),
    captured: raw.captureNow,
    customerId: raw.chargePermissionId ?? undefined,
    statementDescriptor: raw.softDescriptor ?? undefined,
    failureCode: raw.statusDetails?.reasonCode ?? undefined,
    failureMessage: reason ?? undefined,
    description: raw.merchantMetadata?.noteToBuyer ?? undefined,
    gateway: 'amazon-pay',
    metadata: strMap({
      chargePermissionId: raw.chargePermissionId,
      merchantReferenceId: raw.merchantMetadata?.merchantReferenceId,
      merchantStoreName: raw.merchantMetadata?.merchantStoreName,
      customInformation: raw.merchantMetadata?.customInformation,
      providerReferenceId: raw.providerMetadata?.providerReferenceId,
      releaseEnvironment: raw.releaseEnvironment,
      state: raw.statusDetails?.state,
    }),
    createdAt: toIsoDatetime(raw.creationTimestamp),
    updatedAt: toIsoDatetime(raw.statusDetails?.lastUpdatedTimestamp),
    raw,
  }
}
