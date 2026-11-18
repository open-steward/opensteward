/**
 * Epos Now Refund -> canonical Refund.
 *
 * Epos Now refunds are linked to the original transaction and contain
 * a refund amount and optional line item details.
 */

import type { Refund } from '../../../schema/refund'
import { majorToMinor } from '../../../schema/shared'

const ZERO_DECIMAL = new Set([
  'JPY', 'KRW', 'VND', 'CLP', 'ISK', 'XOF', 'XAF', 'PYG', 'UGX', 'RWF',
])
const THREE_DECIMAL = new Set(['BHD', 'KWD', 'OMR', 'TND', 'JOD', 'IQD', 'LYD'])

/** Integer minor units → major-unit decimal for upstream payloads. */
function minorToMajor(money: { amount: number; currency: string } | undefined):
  | number
  | undefined {
  if (money == null) return undefined
  const c = money.currency.toUpperCase()
  const exponent = ZERO_DECIMAL.has(c) ? 0 : THREE_DECIMAL.has(c) ? 3 : 2
  return money.amount / 10 ** exponent
}

export interface RawEposNowRefund {
  Id?: number
  TransactionId?: number
  Amount?: number
  Reason?: string
  DateTime?: string
  CreatedDate?: string
  [key: string]: unknown
}

export function transformRefund(raw: RawEposNowRefund): Refund {
  const currency = 'GBP'
  return {
    id: String(raw.Id ?? ''),
    orderId: String(raw.TransactionId ?? ''),
    amount: raw.Amount != null
      ? { amount: majorToMinor(raw.Amount, currency), currency }
      : undefined,
    reason: raw.Reason ?? undefined,
    processedAt: raw.DateTime ?? undefined,
    createdAt: raw.CreatedDate ?? raw.DateTime ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Refund -> Epos Now refund request body. */
export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  return {
    TransactionId: refund.orderId != null ? Number(refund.orderId) : undefined,
    Amount: minorToMajor(refund.amount),
    Reason: refund.reason,
  }
}
