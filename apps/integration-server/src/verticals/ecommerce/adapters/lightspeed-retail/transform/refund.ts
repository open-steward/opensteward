/**
 * Lightspeed Retail Refund Sale → canonical Refund.
 *
 * Refunds in Lightspeed R-Series are negative Sales (voided or with negative
 * line item quantities). We identify refunds by negative `calcTotal` or
 * `voided === 'true'` combined with payment references.
 */

import type { Refund } from '../../../schema/refund'
import { lsDecimalToNumber } from './product'
import { majorToMinor } from '../../../schema/shared'
import type { RawLightspeedSale } from './order'

export { type RawLightspeedSale } from './order'

export function transformRefund(raw: RawLightspeedSale): Refund {
  const total = majorToMinor(Math.abs(lsDecimalToNumber(raw.calcTotal || raw.total)), 'USD')
  const payments = raw.SalePayments?.SalePayment
  const paymentArr = payments
    ? Array.isArray(payments)
      ? payments
      : [payments]
    : []
  const transactionIds = paymentArr.map((p) => p.salePaymentID)

  return {
    id: raw.saleID,
    orderId: raw.referenceNumber ?? raw.saleID,
    amount: total > 0 ? { amount: total, currency: 'USD' } : undefined,
    reason: raw.voided === 'true' ? 'voided' : undefined,
    transactionIds: transactionIds.length > 0 ? transactionIds : undefined,
    processedAt: raw.completeTime ?? raw.createTime,
    createdAt: raw.createTime,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Refund → Lightspeed negative Sale body for creating a refund. */
export function untransformRefund(
  refund: Partial<Refund>,
  shopId?: string,
): Record<string, unknown> {
  return {
    shopID: shopId,
    referenceNumber: refund.orderId,
    SaleLines: {
      SaleLine: [
        {
          unitQuantity: '-1',
          unitPrice: refund.amount?.amount != null ? String(refund.amount.amount / 100) : '0',
        },
      ],
    },
  }
}
