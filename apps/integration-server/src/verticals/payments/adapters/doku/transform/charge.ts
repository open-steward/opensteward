import { toIsoDatetime } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, strMap, toMinorUnits } from './shared'

/**
 * Raw shape of a DOKU order/transaction, as returned by both the Checkout
 * generation response and the Check-Status lookup. DOKU nests the order and
 * transaction details under `order`, `transaction`, `payment`, `acquirer`, and
 * `channel`.
 */
export interface RawDokuOrder {
  order?: {
    invoice_number?: string
    amount?: number | string
    currency?: string
    session_id?: string
  }
  transaction?: {
    status?: string
    date?: string
    original_request_id?: string
    message?: string
  }
  payment?: {
    url?: string
    token_id?: string
    expired_date?: string
    payment_method_types?: string[]
    status?: string
  }
  acquirer?: { id?: string }
  channel?: { id?: string }
  customer?: { id?: string; name?: string; email?: string; phone?: string }
  [k: string]: unknown
}

/** Map DOKU's upper-case status enum onto the canonical charge status. */
function mapStatus(raw: RawDokuOrder): ChargeStatus {
  const status = (raw.transaction?.status ?? raw.payment?.status ?? '').toUpperCase()
  switch (status) {
    case 'SUCCESS':
    case 'SETTLEMENT':
      return 'succeeded'
    case 'PENDING':
    case 'ORDER_GENERATED':
      return 'pending'
    case 'FAILED':
    case 'EXPIRED':
      return 'failed'
    case 'REFUNDED':
      return 'refunded'
    case 'VOID':
    case 'CANCELLED':
    case 'CANCELED':
      return 'cancelled'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawDokuOrder): Charge {
  const invoice = raw.order?.invoice_number ?? ''
  return {
    id: String(invoice || raw.order?.session_id || ''),
    externalId: String(invoice || raw.order?.session_id || ''),
    amount: toMinorUnits(raw.order?.amount),
    currency: pickCurrency(raw.order?.currency),
    status: mapStatus(raw),
    customerId: raw.customer?.id ? String(raw.customer.id) : undefined,
    receiptEmail: raw.customer?.email,
    receiptUrl: raw.payment?.url,
    failureMessage: raw.transaction?.message,
    gateway: 'doku',
    metadata: strMap({
      session_id: raw.order?.session_id,
      original_request_id: raw.transaction?.original_request_id,
      acquirer_id: raw.acquirer?.id,
      channel_id: raw.channel?.id,
      token_id: raw.payment?.token_id,
    }),
    createdAt: toIsoDatetime(raw.transaction?.date),
    updatedAt: toIsoDatetime(raw.transaction?.date),
    raw,
  }
}
