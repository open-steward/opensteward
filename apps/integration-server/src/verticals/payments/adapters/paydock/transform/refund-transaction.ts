/**
 * Paydock refund transaction → canonical Refund.
 *
 * Paydock keeps refunds as transactions inside a charge
 * (https://documenter.getpostman.com/view/6912944/Uyr5my5q, folder
 * "charges"): "transactions + array All transactions within the charge", with
 * `transactions[]._id` ("+ string (24 hex characters) An internal ID of the
 * transaction"), `transactions[].amount` ("+ float An amount of the
 * transaction", major units), `transactions[].currency` ("+ string (iso4217
 * alpha-3) A currency code of the transaction"), `transactions[].type` (the
 * "Transaction types" table: "refund A refund transaction"),
 * `transactions[].status` (the "Transaction status" table) and
 * `transactions[].created_at`. The owning charge is the parent row.
 */
import { majorToMinor } from '@opensteward/shared'
import type { Refund, RefundStatus } from '../../../schema/refund'
import { optStr, requireId } from './shared'

export interface RawPaydockTransaction {
  [k: string]: unknown
}

/**
 * The "Transaction status" table, verbatim values that a refund can carry:
 * "complete A complete direct or captured transaction", "failed A failed
 * transaction or refund", "requested A refund pending status",
 * "inprogress A system state of a transaction while it is sending a request
 * to a payment gateway", "cancelled A cancelled transaction".
 */
const STATUS: Record<string, RefundStatus> = {
  complete: 'succeeded',
  failed: 'failed',
  requested: 'pending',
  inprogress: 'pending',
  cancelled: 'cancelled',
}

export function transformRefundTransaction(raw: RawPaydockTransaction, chargeId: string): Refund {
  const id = requireId(raw['_id'], 'refund transaction')
  const currency = optStr(raw['currency'])
  const amount = raw['amount']
  if (currency === undefined || typeof amount !== 'number')
    throw new Error(`Paydock refund transaction ${id} has no documented amount/currency`)
  const cur = currency.toUpperCase()
  const status = raw['status']
  return {
    id,
    externalId: id,
    chargeId,
    amount: majorToMinor(amount, cur),
    currency: cur,
    status: (typeof status === 'string' && STATUS[status]) || 'unknown',
    gateway: 'paydock',
    metadata: {},
    createdAt: optStr(raw['created_at']),
    raw,
  }
}
