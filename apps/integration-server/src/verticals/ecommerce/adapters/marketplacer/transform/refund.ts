/**
 * Marketplacer RefundRequest → canonical Refund transform.
 *
 * `refundRequestCreate` only STARTS a refund/return (status AWAITING); the
 * mutations that finalize it — `refundRequestRefund` and its replacement
 * `refundRequestApprove` — are documented "Operator Only" ("This part of the
 * flow can only be undertaken by the operator"), so this adapter's
 * `createRefund` creates the request and nothing more. Reading back confirms
 * only `id`, `status`, `invoice.id` and each line's `reason` — no amount or
 * per-line quantity is exposed by the `refundRequests` query, so those stay
 * unset on read rather than being guessed.
 *
 * Docs: https://api.marketplacer.com/docs/seller-api/examples/refunds/howto_sellerinitrefunds/
 *       (Refunds Workflow) and
 *       https://api.marketplacer.com/docs/seller-api/reference/queries/refundrequests/
 *       https://api.marketplacer.com/docs/seller-api/reference/mutations/refundrequestcreate/
 */
import type { Refund } from '../../../schema/refund'

export interface RawMarketplacerRefundRequest {
  id: string
  status?: string
  invoice?: { id: string } | null
  lineItems?: Array<{ id: string; reason?: string | null }>
  [key: string]: unknown
}

export function transformRefund(raw: RawMarketplacerRefundRequest): Refund {
  const firstReason = raw.lineItems?.find((li) => li.reason)?.reason
  return {
    id: String(raw.id),
    orderId: raw.invoice?.id != null ? String(raw.invoice.id) : '',
    reason: firstReason ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export interface MarketplacerRefundRequestCreateInput {
  invoiceId: string
  lineItems: Array<{ lineItemId: string; quantity: number; reason?: string }>
  notes?: Array<{ note: string }>
}

/** Builds `refundRequestCreate`'s `input` from a canonical create request. */
export function untransformRefund(data: Partial<Refund>): MarketplacerRefundRequestCreateInput {
  if (!data.orderId) throw new Error('createRefund requires orderId (the Marketplacer Invoice id)')
  const lines = data.refundLineItems ?? []
  if (lines.length === 0) {
    throw new Error(
      'createRefund requires at least one refundLineItems entry — Marketplacer refund requests are always raised against specific invoice line items.',
    )
  }
  return {
    invoiceId: data.orderId,
    lineItems: lines.map((li) => ({
      lineItemId: li.lineItemId,
      quantity: li.quantity,
      reason: data.reason,
    })),
    ...(data.note ? { notes: [{ note: data.note }] } : {}),
  }
}
