/**
 * Walmart Return / Refund → canonical Refund.
 *
 * Walmart handles refunds through its Returns API:
 *   GET /v3/returns → list returns
 *   POST /v3/orders/{purchaseOrderId}/refund → issue a refund
 *
 * Returns contain refund amounts per return order line. We project
 * each return into a canonical Refund.
 */

import type { Refund } from '../../../schema/refund'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawWalmartReturnCharge {
  chargeType?: string
  chargeName?: string
  chargeAmount?: {
    currency?: string
    amount?: number
  }
}

export interface RawWalmartReturnOrderLine {
  returnOrderLineNumber?: string
  salesOrderLineNumber?: string
  item?: {
    sku?: string
    productName?: string
  }
  charges?: RawWalmartReturnCharge[]
  quantity?: {
    unitOfMeasurement?: string
    amount?: string
  }
  returnReason?: string
}

export interface RawWalmartReturn {
  returnOrderId: string
  customerOrderId?: string
  returnOrderDate?: string
  returnOrderLines?: RawWalmartReturnOrderLine[]
  totalRefundAmount?: {
    currency?: string
    amount?: number
  }
  status?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toMoney(m: { currency?: string; amount?: number } | undefined):
  | { amount: number; currency: string }
  | undefined {
  if (!m || m.amount == null) return undefined
  const currency = m.currency ?? 'USD'
  return { amount: majorToMinor(m.amount, currency), currency }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformRefund(raw: RawWalmartReturn): Refund {
  const amount = toMoney(raw.totalRefundAmount)
  const reason = raw.returnOrderLines?.[0]?.returnReason

  const refundLineItems = raw.returnOrderLines?.map((line) => ({
    lineItemId: line.salesOrderLineNumber ?? line.returnOrderLineNumber ?? '0',
    quantity: line.quantity?.amount ? parseInt(line.quantity.amount, 10) : 1,
    amount: toMoney(
      line.charges?.find((c) => c.chargeType === 'PRODUCT')?.chargeAmount,
    ),
  }))

  return {
    id: raw.returnOrderId,
    orderId: raw.customerOrderId ?? raw.returnOrderId,
    amount,
    reason,
    refundLineItems: refundLineItems && refundLineItems.length > 0 ? refundLineItems : undefined,
    processedAt: raw.returnOrderDate,
    createdAt: raw.returnOrderDate,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Refund → Walmart refund request body.
 */
export function untransformRefund(data: Partial<Refund>): Record<string, unknown> {
  const body: Record<string, unknown> = {}

  const orderRefund: Record<string, unknown> = {}
  if (data.refundLineItems && data.refundLineItems.length > 0) {
    orderRefund['refundLines'] = {
      refundLine: data.refundLineItems.map((li) => ({
        lineNumber: li.lineItemId,
        refundQuantity: {
          unitOfMeasurement: 'EACH',
          amount: String(li.quantity),
        },
        refundCharges: li.amount
          ? {
              refundCharge: [
                {
                  chargeType: 'PRODUCT',
                  refundAmount: {
                    currency: li.amount.currency,
                    amount: li.amount.amount,
                  },
                },
              ],
            }
          : undefined,
      })),
    }
  }

  body['orderRefund'] = orderRefund
  return body
}
