import type { Dispute, DisputeReason, DisputeStatus } from '../../../schema/dispute'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawPayPalDispute {
  dispute_id?: string
  status?: string
  reason?: string
  dispute_amount?: { value?: string; currency_code?: string }
  disputed_transactions?: Array<{ seller_transaction_id?: string }>
  evidence_response_options?: { return_url?: string }
  evidence_responses?: Array<unknown>
  create_time?: string
  update_time?: string
  [k: string]: unknown
}

function mapStatus(raw: RawPayPalDispute): DisputeStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'OPEN':
    case 'WAITING_FOR_BUYER_RESPONSE':
      return 'needs_response'
    case 'WAITING_FOR_SELLER_RESPONSE':
      return 'needs_response'
    case 'UNDER_REVIEW':
      return 'under_review'
    case 'RESOLVED':
      return 'won'
    case 'OTHER':
    default:
      return 'needs_response'
  }
}

function mapReason(raw: RawPayPalDispute): DisputeReason | undefined {
  switch ((raw.reason ?? '').toUpperCase()) {
    case 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED':
      return 'product_not_received'
    case 'MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED':
      return 'product_unacceptable'
    case 'UNAUTHORISED':
    case 'UNAUTHORIZED':
      return 'fraudulent'
    case 'CREDIT_NOT_PROCESSED':
      return 'credit_not_processed'
    case 'DUPLICATE_TRANSACTION':
      return 'duplicate'
    default:
      return raw.reason ? 'other' : undefined
  }
}

export function transformDispute(raw: RawPayPalDispute): Dispute {
  return {
    id: String(raw.dispute_id ?? ''),
    externalId: String(raw.dispute_id ?? ''),
    chargeId: raw.disputed_transactions?.[0]?.seller_transaction_id ?? '',
    amount: decimalToMinor(raw.dispute_amount?.value),
    currency: pickCurrency(raw.dispute_amount?.currency_code),
    status: mapStatus(raw),
    reason: mapReason(raw),
    gateway: 'paypal',
    metadata: strMap({}),
    createdAt: raw.create_time,
    updatedAt: raw.update_time,
    raw,
  }
}
