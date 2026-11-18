/**
 * JD.com after-sales / refund → canonical Refund.
 *
 * JD exposes refund data through the after-sales service API:
 * `jingdong.asc.serviceAndRefund.view`. This returns paginated
 * refund records with amounts and status under the
 * `jingdong_asc_serviceAndRefund_view_responce` envelope.
 *
 * Amounts in the raw response are in fen (CNY * 100). We convert to
 * whole-yuan floats to match how other JD adapters handle CNY
 * (order prices are already in yuan, so we apply the same convention).
 *
 * Status codes: 13 = success, 14 = failed.
 */

import type { Refund } from '../../../schema/refund'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawJdServiceBill {
  serviceId?: number | string
  afsApplyId?: number | string
  orderId?: number | string
  wareId?: number | string
  wareName?: string
  approveName?: string
  afsApplyTime?: number | string
  approveDate?: number | string
  questionDesc?: string
  customerPin?: string
  approveNotes?: string
  applyReason?: string
  [key: string]: unknown
}

export interface RawJdRefundRecord {
  afsRefundId?: number | string
  /** Refund amount in fen (CNY × 100). */
  refoundAmount?: number | string
  /** Unix timestamp (milliseconds) of refund completion. */
  completeTime?: number | string
  /** 13 = success, 14 = failed. */
  status?: number | string
  sameOrderServiceBill?: RawJdServiceBill
  [key: string]: unknown
}

export interface RawJdRefundPage {
  success?: boolean
  code?: string
  msg?: string
  pageSize?: string | number
  pageNumber?: string | number
  totalCount?: string | number
  data?: RawJdRefundRecord[]
  [key: string]: unknown
}

export interface RawJdRefundEnvelope {
  jingdong_asc_serviceAndRefund_view_responce?: {
    pageResult?: RawJdRefundPage
  }
  error_response?: { code?: string; zh_desc?: string }
  [key: string]: unknown
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformRefund(raw: RawJdRefundRecord): Refund {
  const bill = raw.sameOrderServiceBill
  const orderId = bill?.orderId != null ? String(bill.orderId) : undefined
  const refundId = raw.afsRefundId != null ? String(raw.afsRefundId) : String(bill?.serviceId ?? '0')

  // refoundAmount is in fen; convert to yuan
  const amountFen = raw.refoundAmount != null ? Number(raw.refoundAmount) : undefined
  const amountYuan = amountFen != null ? amountFen / 100 : undefined

  const completedMs = raw.completeTime != null ? Number(raw.completeTime) : undefined
  const processedAt = completedMs ? new Date(completedMs).toISOString() : undefined

  const applyMs = bill?.afsApplyTime != null ? Number(bill.afsApplyTime) : undefined
  const createdAt = applyMs ? new Date(applyMs).toISOString() : undefined

  return {
    id: refundId,
    orderId: orderId ?? '',
    amount: amountYuan != null ? { amount: amountYuan, currency: 'CNY' } : undefined,
    reason: bill?.applyReason ?? bill?.questionDesc,
    note: bill?.approveNotes,
    restock: false, // JD's after-sales system manages returns separately
    processedAt,
    createdAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
