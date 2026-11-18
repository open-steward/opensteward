import type { Charge, ChargeStatus } from '../../../schema/charge'
import { decimalToMinor, parseNmiDatetime, pickCurrency, strMap, xmlTag } from './shared'

/**
 * A normalised NMI charge, parsed from EITHER:
 *  - a Query API `<transaction>` block (transaction_id, condition, amount, …),
 *    decoded into this flat shape by `chargeFromTransactionXml`, OR
 *  - a Payment API (transact.php) response map (transactionid, response, …),
 *    decoded by `chargeFromTransactResponse`.
 *
 * `condition` is the Query API lifecycle state; `response` (1/2/3) is the
 * Payment API immediate result. We carry both so `mapStatus` can use whichever
 * is present.
 */
export interface RawNmiTransaction {
  transactionId?: string
  /** Query API lifecycle: pending / pendingsettlement / complete / failed / canceled / unknown. */
  condition?: string
  /** Payment API immediate result: 1 = approved, 2 = declined, 3 = error. */
  response?: string
  responseText?: string
  responseCode?: string
  authCode?: string
  /** sale / auth / capture / void / refund / credit. */
  type?: string
  /** ck (ACH) / cc (credit card). */
  transactionType?: string
  amount?: string
  amountRefunded?: string
  currency?: string
  customerId?: string
  email?: string
  firstName?: string
  lastName?: string
  orderId?: string
  date?: string
  raw?: unknown
}

function mapStatus(raw: RawNmiTransaction): ChargeStatus {
  // Prefer the Query API lifecycle condition when present.
  const cond = (raw.condition ?? '').toLowerCase()
  if (cond) {
    if (cond === 'complete') return 'succeeded'
    if (cond === 'pending' || cond === 'pendingsettlement') return 'pending'
    if (cond === 'canceled' || cond === 'cancelled') return 'cancelled'
    if (cond === 'failed') return 'failed'
  }
  // Fall back to the Payment API immediate response (1/2/3).
  const resp = (raw.response ?? '').trim()
  if (resp === '1') return 'succeeded'
  if (resp === '2' || resp === '3') return 'failed'
  return 'pending'
}

export function transformCharge(raw: RawNmiTransaction): Charge {
  const name = [raw.firstName, raw.lastName].filter(Boolean).join(' ').trim()
  const refunded = decimalToMinor(raw.amountRefunded)
  return {
    id: String(raw.transactionId ?? ''),
    externalId: String(raw.transactionId ?? ''),
    amount: decimalToMinor(raw.amount),
    currency: pickCurrency(raw.currency),
    amountRefunded: refunded > 0 ? refunded : undefined,
    status: mapStatus(raw),
    customerId: raw.customerId || undefined,
    receiptEmail: raw.email || undefined,
    description: name || raw.orderId || undefined,
    failureCode: raw.responseCode || undefined,
    failureMessage:
      (raw.response ?? '') !== '1' ? raw.responseText || undefined : undefined,
    gateway: 'nmi',
    metadata: strMap({
      order_id: raw.orderId,
      auth_code: raw.authCode,
      transaction_type: raw.type,
      payment_type: raw.transactionType,
    }),
    createdAt: parseNmiDatetime(raw.date),
    raw: raw.raw ?? raw,
  }
}

/** Decode a Payment API (transact.php) response map into `RawNmiTransaction`. */
export function chargeFromTransactResponse(
  res: Record<string, string>,
  context: { amount?: number; currency?: string; orderId?: string } = {},
): RawNmiTransaction {
  return {
    transactionId: res.transactionid,
    response: res.response,
    responseText: res.responsetext,
    responseCode: res.response_code,
    authCode: res.authcode,
    type: res.type,
    amount:
      res.amount ?? (context.amount !== undefined ? (context.amount / 100).toFixed(2) : undefined),
    currency: res.currency ?? context.currency,
    orderId: res.orderid ?? context.orderId,
    raw: res,
  }
}

/** Decode one Query API `<transaction>` XML block into `RawNmiTransaction`. */
export function chargeFromTransactionXml(block: string): RawNmiTransaction {
  return {
    transactionId: xmlTag(block, 'transaction_id'),
    condition: xmlTag(block, 'condition'),
    responseCode: xmlTag(block, 'response_code'),
    type: xmlTag(block, 'action_type') ?? xmlTag(block, 'type'),
    transactionType: xmlTag(block, 'transaction_type'),
    amount: xmlTag(block, 'amount'),
    currency: xmlTag(block, 'currency'),
    customerId: xmlTag(block, 'customerid') ?? xmlTag(block, 'customer_vault_id'),
    email: xmlTag(block, 'email'),
    firstName: xmlTag(block, 'first_name'),
    lastName: xmlTag(block, 'last_name'),
    orderId: xmlTag(block, 'order_id') ?? xmlTag(block, 'orderid'),
    // `<action>` blocks carry per-event timestamps; the first action date is
    // the transaction's effective creation time.
    date: xmlTag(block, 'date'),
    raw: block,
  }
}
