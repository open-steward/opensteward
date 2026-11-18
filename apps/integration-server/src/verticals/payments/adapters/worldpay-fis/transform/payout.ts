/**
 * Maps a Worldpay Access Account Payouts API response to the canonical Payout type.
 *
 * Endpoints:
 *   POST https://try.access.worldpay.com/accountPayouts               (single payout)
 *   GET  https://try.access.worldpay.com/accountPayouts/events        (search payouts)
 *   GET  https://try.access.worldpay.com/accountPayouts/{payoutRequestId} (by ID)
 *
 * Response fields documented at:
 * https://docs.worldpay.com/access/products/account-payouts/openapi/get-payouts
 */

import type { Payout, PayoutStatus } from '../../../schema/payout'
import { pickCurrency, strMap } from './shared'

export interface RawWorldpayPayoutItem {
  payoutRequestId?: string
  paymentId?: string
  paymentDatetime?: string
  payeeName?: string
  sourceCurrency?: string
  sourceAmount?: number
  targetCurrency?: string
  targetAmount?: number
  paymentState?: string
  bankName?: string
  bankCode?: string
  iban?: string
  channel?: string
  routedChannel?: string
  bankReference?: string
  narrative?: string
  transactionReference?: string
  accountNumber?: string
  swiftBic?: string
  entity?: string
  countryCode?: string
  [k: string]: unknown
}

function mapStatus(paymentState: string | undefined): PayoutStatus {
  switch ((paymentState ?? '').toUpperCase()) {
    case 'EXECUTED':
    case 'PAID':
    case 'SETTLED':
      return 'paid'
    case 'SENT':
    case 'SUBMITTED':
    case 'PROCESSING':
      return 'in_transit'
    case 'PENDING':
    case 'CREATED':
      return 'pending'
    case 'FAILED':
    case 'REJECTED':
    case 'ERROR':
      return 'failed'
    case 'CANCELLED':
    case 'CANCELED':
    case 'REVERSED':
      return 'cancelled'
    default:
      return 'pending'
  }
}

export function transformPayout(raw: RawWorldpayPayoutItem): Payout {
  return {
    id: String(raw.payoutRequestId ?? raw.paymentId ?? ''),
    externalId: String(raw.payoutRequestId ?? raw.paymentId ?? ''),
    amount: raw.targetAmount ?? raw.sourceAmount ?? 0,
    currency: pickCurrency(raw.targetCurrency ?? raw.sourceCurrency),
    status: mapStatus(raw.paymentState),
    arrivalDate: raw.paymentDatetime,
    statementDescriptor: raw.narrative,
    gateway: 'worldpay-fis',
    metadata: strMap({
      payeeName: raw.payeeName,
      bankName: raw.bankName,
      bankReference: raw.bankReference,
      transactionReference: raw.transactionReference,
      channel: raw.channel,
      routedChannel: raw.routedChannel,
      countryCode: raw.countryCode,
    }),
    createdAt: raw.paymentDatetime,
    raw,
  }
}
