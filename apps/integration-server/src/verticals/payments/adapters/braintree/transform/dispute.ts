import type { Dispute, DisputeReason, DisputeStatus } from '../../../schema/dispute'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawBraintreeDispute {
  id?: string
  legacyId?: string
  status?: string
  reason?: string
  amountDisputed?: { value?: string; currencyIsoCode?: string }
  transaction?: { id?: string }
  receivedDate?: string
  replyByDate?: string
  [k: string]: unknown
}

function mapStatus(raw: RawBraintreeDispute): DisputeStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'OPEN':
      return 'needs_response'
    case 'UNDER_REVIEW':
      return 'under_review'
    case 'WON':
      return 'won'
    case 'LOST':
    case 'ACCEPTED':
      return 'lost'
    default:
      return 'needs_response'
  }
}

function mapReason(raw: RawBraintreeDispute): DisputeReason | undefined {
  switch ((raw.reason ?? '').toUpperCase()) {
    case 'FRAUD':
      return 'fraudulent'
    case 'DUPLICATE':
      return 'duplicate'
    case 'PRODUCT_NOT_RECEIVED':
      return 'product_not_received'
    case 'PRODUCT_UNSATISFACTORY':
      return 'product_unacceptable'
    case 'CREDIT_NOT_PROCESSED':
      return 'credit_not_processed'
    case 'GENERAL':
      return 'general'
    case 'CANCELED_RECURRING_TRANSACTION':
      return 'subscription_cancelled'
    default:
      return raw.reason ? 'other' : undefined
  }
}

export function transformDispute(raw: RawBraintreeDispute): Dispute {
  return {
    id: String(raw.id ?? raw.legacyId ?? ''),
    externalId: String(raw.id ?? raw.legacyId ?? ''),
    chargeId: String(raw.transaction?.id ?? ''),
    amount: decimalToMinor(raw.amountDisputed?.value),
    currency: pickCurrency(raw.amountDisputed?.currencyIsoCode),
    status: mapStatus(raw),
    reason: mapReason(raw),
    evidenceDueBy: raw.replyByDate,
    gateway: 'braintree',
    metadata: strMap({}),
    createdAt: raw.receivedDate,
    raw,
  }
}
