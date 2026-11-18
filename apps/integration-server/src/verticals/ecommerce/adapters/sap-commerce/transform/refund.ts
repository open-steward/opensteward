/**
 * SAP Commerce Cloud → canonical Refund.
 *
 * SAP Commerce handles refunds through the order management system
 * (return requests / return entries). The OCC API exposes limited
 * refund data; full refund management is typically done via Backoffice.
 *
 * This transform synthesizes refund records from return request data
 * when available, or from order-level cancellation info.
 */

import type { Refund } from '../../../schema/refund'
import { toIsoDatetime } from '@opensteward/shared'
import { majorToMinor } from '../../../schema/shared'

export interface RawSapReturnEntry {
  orderEntry?: { entryNumber?: number }
  expectedQuantity?: number
  refundAmount?: { value?: number; currencyIso?: string }
  action?: string
  [key: string]: unknown
}

export interface RawSapReturnRequest {
  code?: string
  rma?: string
  status?: string
  returnEntries?: RawSapReturnEntry[]
  refundDeliveryCost?: boolean
  order?: { code?: string }
  creationTime?: string
  [key: string]: unknown
}

export function transformRefund(
  raw: RawSapReturnRequest,
  orderId?: string,
): Refund {
  const totalAmount = raw.returnEntries?.reduce(
    (sum, e) => sum + (e.refundAmount?.value ?? 0),
    0,
  )
  const currency = raw.returnEntries?.[0]?.refundAmount?.currencyIso ?? 'USD'

  return {
    id: raw.rma ?? raw.code ?? '',
    orderId: orderId ?? raw.order?.code ?? '',
    amount: totalAmount !== undefined
      ? { amount: majorToMinor(totalAmount, currency), currency }
      : undefined,
    reason: raw.status,
    refundLineItems: raw.returnEntries?.map((e) => ({
      lineItemId: String(e.orderEntry?.entryNumber ?? 0),
      quantity: e.expectedQuantity ?? 0,
      amount: e.refundAmount
        ? { amount: majorToMinor(e.refundAmount.value ?? 0, e.refundAmount.currencyIso ?? 'USD'), currency: e.refundAmount.currencyIso ?? 'USD' }
        : undefined,
    })),
    createdAt: toIsoDatetime(raw.creationTime),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformRefund(
  refund: Partial<Refund>,
): Record<string, unknown> {
  return {
    order: { code: refund.orderId },
    returnEntries: refund.refundLineItems?.map((li) => ({
      orderEntry: { entryNumber: parseInt(li.lineItemId, 10) },
      expectedQuantity: li.quantity,
      action: 'REFUND',
    })),
  }
}
