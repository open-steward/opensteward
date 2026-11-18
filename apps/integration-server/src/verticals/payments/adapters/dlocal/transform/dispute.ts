import type { Dispute, DisputeStatus } from '../../../schema/dispute'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawDLocalChargeback {
  id?: string
  payment_id?: string
  created_date?: string
  currency?: string
  amount?: number
  status?: string
  status_code?: number | string
  status_detail?: string
  order_id?: string
  chargeback_date?: string
  chargeback_stage?: string
  processor_id?: string
  reason_code?: string
  reason_description?: string
  arn?: string
  [k: string]: unknown
}

function mapStatus(raw: RawDLocalChargeback): DisputeStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'PENDING':
    case 'INQUIRY':
      return 'needs_response'
    case 'DISPUTE_RECEIVED':
    case 'UNDER_REVIEW':
      return 'under_review'
    case 'WON':
      return 'won'
    case 'LOST':
      return 'lost'
    case 'CLOSED':
      return 'warning_closed'
    default:
      return 'needs_response'
  }
}

export function transformDispute(raw: RawDLocalChargeback): Dispute {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    chargeId: String(raw.payment_id ?? ''),
    amount: decimalToMinor(raw.amount),
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw),
    reason: raw.reason_code ? 'other' : undefined,
    gateway: 'dlocal',
    metadata: strMap({
      reason_code: raw.reason_code,
      reason_description: raw.reason_description,
      chargeback_stage: raw.chargeback_stage,
      processor_id: raw.processor_id,
      arn: raw.arn,
      order_id: raw.order_id,
      status_detail: raw.status_detail,
    }),
    createdAt: raw.chargeback_date ?? raw.created_date,
    raw,
  }
}
