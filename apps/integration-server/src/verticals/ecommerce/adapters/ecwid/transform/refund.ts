/**
 * Ecwid does not have a first-class refund resource separate from
 * orders. Refunds are modelled as order status changes (paymentStatus:
 * REFUNDED) and the refund amount is tracked in the order itself.
 *
 * This transform provides a minimal mapping from an order-level refund
 * representation. The adapter constructs these from order data.
 */

import type { Refund } from '../../../schema/refund'
import { majorToMinor } from '../../../schema/shared'

const ZERO_DECIMAL = new Set([
  'JPY', 'KRW', 'VND', 'CLP', 'ISK', 'XOF', 'XAF', 'PYG', 'UGX', 'RWF',
])
const THREE_DECIMAL = new Set(['BHD', 'KWD', 'OMR', 'TND', 'JOD', 'IQD', 'LYD'])

/** Integer minor units → major-unit decimal number for upstream payloads. */
function minorToMajor(amount: number, currency: string): number {
  const c = currency.toUpperCase()
  const exponent = ZERO_DECIMAL.has(c) ? 0 : THREE_DECIMAL.has(c) ? 3 : 2
  return amount / 10 ** exponent
}

export interface RawEcwidRefund {
  id: number | string
  orderId: number | string
  amount?: number
  reason?: string | null
  date?: string
  [key: string]: unknown
}

export function transformRefund(
  raw: RawEcwidRefund,
  currency: string = 'USD',
): Refund {
  return {
    id: String(raw.id),
    orderId: String(raw.orderId),
    amount: raw.amount != null ? { amount: majorToMinor(raw.amount, currency), currency } : undefined,
    reason: raw.reason ?? undefined,
    restock: false,
    createdAt: raw.date,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  return {
    amount:
      refund.amount != null
        ? minorToMajor(refund.amount.amount, refund.amount.currency)
        : undefined,
    reason: refund.reason,
  }
}
