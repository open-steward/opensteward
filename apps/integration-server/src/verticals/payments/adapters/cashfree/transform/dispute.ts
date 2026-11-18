import { toIsoDatetime } from '@opensteward/shared'
import type { Dispute, DisputeStatus, DisputeReason } from '../../../schema/dispute'
import { pickCurrency, strMap, toMinorUnits } from './shared'

/**
 * Cashfree Dispute entity (`GET /disputes/{dispute_id}` or
 * `GET /orders/{order_id}/disputes`).
 *
 * Cashfree exposes disputes at two scopes:
 *   - `GET /disputes/{dispute_id}` — single dispute by Cashfree dispute ID
 *   - `GET /orders/{order_id}/disputes` — all disputes for an order
 *
 * There is no global "list all disputes" endpoint.
 */
export interface RawCashfreeDispute {
  dispute_id?: string | number
  dispute_type?: string
  reason_code?: string | null
  reason_description?: string | null
  dispute_amount?: number | string
  dispute_amount_currency?: string
  dispute_status?: string
  cf_dispute_remarks?: string | null
  created_at?: string
  respond_by?: string | null
  updated_at?: string | null
  resolved_at?: string | null
  preferred_evidence?: Array<{ document_type?: string; [k: string]: unknown }> | null
  dispute_evidence?: Array<{
    document_id?: string
    document_name?: string
    document_type?: string
    [k: string]: unknown
  }> | null
  order_details?: {
    order_id?: string
    order_amount?: number | string
    order_currency?: string
    cf_payment_id?: string | number
    payment_amount?: number | string
    [k: string]: unknown
  } | null
  customer_details?: {
    customer_name?: string
    customer_phone?: string
    customer_email?: string
    [k: string]: unknown
  } | null
  [k: string]: unknown
}

function mapStatus(raw: string): DisputeStatus {
  switch (raw.toUpperCase()) {
    case 'DISPUTE_CREATED':
    case 'DISPUTE_DOCS_RECEIVED':
    case 'DISPUTE_UNDER_REVIEW':
      return 'under_review'
    case 'DISPUTE_ACTION_REQUIRED':
      return 'needs_response'
    case 'CHARGEBACK_MERCHANT_WON':
    case 'DISPUTE_RESOLVED_IN_FAVOR_OF_MERCHANT':
    case 'PRE_ARBITRATION_MERCHANT_WON':
    case 'ARBITRATION_MERCHANT_WON':
      return 'won'
    case 'CHARGEBACK_CUSTOMER_WON':
    case 'DISPUTE_RESOLVED_IN_FAVOR_OF_CUSTOMER':
    case 'PRE_ARBITRATION_CUSTOMER_WON':
    case 'ARBITRATION_CUSTOMER_WON':
      return 'lost'
    case 'DISPUTE_ACCEPTED':
    case 'DISPUTE_RESOLVED':
      return 'charge_refunded'
    default:
      return 'needs_response'
  }
}

function mapReason(raw: string | null | undefined): DisputeReason | undefined {
  if (!raw) return undefined
  const r = raw.toUpperCase()
  if (r.includes('FRAUD')) return 'fraudulent'
  if (r.includes('DUPLICATE')) return 'duplicate'
  if (r.includes('NOT_RECEIVED') || r.includes('NOT_DELIVER')) return 'product_not_received'
  if (r.includes('NOT_ACCEPTABLE') || r.includes('UNACCEPTABLE')) return 'product_unacceptable'
  if (r.includes('CREDIT') || r.includes('REFUND')) return 'credit_not_processed'
  if (r.includes('SUBSCRI') || r.includes('CANCEL')) return 'subscription_cancelled'
  if (r.includes('UNREC')) return 'unrecognized'
  return 'other'
}

export function transformDispute(raw: RawCashfreeDispute): Dispute {
  const id = String(raw.dispute_id ?? '')

  return {
    id,
    externalId: id,
    chargeId: String(
      raw.order_details?.order_id ??
      raw.order_details?.cf_payment_id ??
      '',
    ),
    amount: toMinorUnits(raw.dispute_amount ?? raw.order_details?.payment_amount),
    currency: pickCurrency(raw.dispute_amount_currency ?? raw.order_details?.order_currency),
    status: mapStatus(String(raw.dispute_status ?? '')),
    reason: mapReason(raw.reason_code ?? raw.reason_description),
    evidenceDueBy: toIsoDatetime(raw.respond_by) ?? undefined,
    gateway: 'cashfree',
    metadata: strMap({
      dispute_type: raw.dispute_type,
      reason_code: raw.reason_code,
      reason_description: raw.reason_description,
      cf_dispute_remarks: raw.cf_dispute_remarks,
      order_id: raw.order_details?.order_id,
    }),
    createdAt: toIsoDatetime(raw.created_at) ?? undefined,
    updatedAt: toIsoDatetime(raw.updated_at ?? raw.created_at) ?? undefined,
    raw,
  }
}
