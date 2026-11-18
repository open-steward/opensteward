/**
 * Newegg RMA (Return Merchandise Authorization) → canonical Refund.
 *
 * Newegg handles refunds through its RMA system. Sellers issue refunds
 * by processing RMA requests. Each RMA has a status, refund amount, and
 * associated order/item info.
 *
 * POST /ordermgmt/order/rma → issue/query RMA
 */

import type { Refund } from '../../../schema/refund'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawNeweggRMAItem {
  SellerPartNumber?: string
  NeweggItemNumber?: string
  Description?: string
  Quantity?: number
  UnitPrice?: number
  RefundAmount?: number
  RMAType?: string
  RMATypeDescription?: string
  RMAReason?: string
  RMAReasonDescription?: string
}

export interface RawNeweggRMA {
  RMANumber: string
  OrderNumber?: string
  RMADate?: string
  RMADateInGMT?: string
  RMAStatus?: number
  RMAStatusDescription?: string
  RMAType?: number
  RMATypeDescription?: string
  SourceSONumber?: string
  RefundTotalAmount?: number
  RMAItemList?: RawNeweggRMAItem[]
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toMoney(amount: number | undefined, currency = 'USD'):
  | { amount: number; currency: string }
  | undefined {
  if (amount == null) return undefined
  return { amount: majorToMinor(amount, currency), currency }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformRefund(raw: RawNeweggRMA): Refund {
  const amount = toMoney(raw.RefundTotalAmount)
  const reason = raw.RMATypeDescription ?? raw.RMAStatusDescription

  const refundLineItems = raw.RMAItemList?.map((item) => ({
    lineItemId: item.SellerPartNumber ?? item.NeweggItemNumber ?? '0',
    quantity: item.Quantity ?? 1,
    amount: toMoney(item.RefundAmount),
  }))

  return {
    id: raw.RMANumber,
    orderId: raw.OrderNumber ?? raw.SourceSONumber ?? raw.RMANumber,
    amount,
    reason,
    refundLineItems: refundLineItems && refundLineItems.length > 0 ? refundLineItems : undefined,
    processedAt: raw.RMADateInGMT ?? raw.RMADate,
    createdAt: raw.RMADateInGMT ?? raw.RMADate,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Refund → Newegg RMA request body.
 */
export function untransformRefund(data: Partial<Refund>): Record<string, unknown> {
  const body: Record<string, unknown> = {}

  if (data.orderId) body['OrderNumber'] = data.orderId
  if (data.reason) body['RMATypeDescription'] = data.reason

  if (data.refundLineItems && data.refundLineItems.length > 0) {
    body['RMAItemList'] = data.refundLineItems.map((li) => ({
      SellerPartNumber: li.lineItemId,
      Quantity: li.quantity,
      RefundAmount: li.amount?.amount != null ? li.amount.amount / 100 : undefined,
    }))
  }

  return body
}
