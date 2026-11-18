/**
 * Tyro Reporting transaction -> canonical Charge.
 *
 * Source: the `transaction` schema of GET /reporting/merchants/{mid}/transactions
 * https://docs.connect.tyro.com/_spec/api-explorer/reporting/1.0/index.yaml
 *
 * Amounts are documented "in cents" and the response carries no currency code
 * (`dcc.currencyCode` is only the "Foreign currency code for DCC transaction"),
 * so the currency comes from the connection. It is never defaulted.
 */

import type { Charge } from '../../../schema/charge'
import { requireCents, requireCurrency, compactMap } from './reporting'

export interface RawTyroTransaction {
  transactionId: string
  transactionLocalDateTime?: string
  transactionStatus?: string
  transactionDescription?: string | null
  locationId?: string
  tid?: number
  paymentType?: string
  isRefund?: boolean
  isReversal?: boolean
  totalAmount?: number
  acquirerActionCode?: string
  rrn?: number | null
  tyroReference?: number | null
  integratedTransactionId?: string | null
  [key: string]: unknown
}

/**
 * `transactionStatus`: "Possible values include `APPROVED`, `DECLINED`,
 * `CANCELLED`, `TIMED_OUT`, `VOIDED`, `PRE_AUTHORISED`."
 */
function mapStatus(status: unknown): Charge['status'] {
  switch (status) {
    case 'APPROVED':
      return 'succeeded'
    case 'DECLINED':
    case 'TIMED_OUT':
      return 'failed'
    case 'CANCELLED':
    case 'VOIDED':
      return 'cancelled'
    case 'PRE_AUTHORISED':
      return 'pending'
    default:
      return 'unknown'
  }
}

export function transformCharge(
  raw: RawTyroTransaction,
  context: { currency: string; terminalBusinessDay?: string },
): Charge {
  if (typeof raw.transactionId !== 'string' || raw.transactionId === '') {
    throw new Error('Tyro transaction has no transactionId')
  }
  return {
    id: raw.transactionId,
    externalId: raw.transactionId,
    amount: requireCents(raw.totalAmount, `transaction ${raw.transactionId} totalAmount`),
    currency: requireCurrency(context.currency),
    status: mapStatus(raw.transactionStatus),
    description:
      typeof raw.transactionDescription === 'string' && raw.transactionDescription !== ''
        ? raw.transactionDescription
        : undefined,
    gateway: 'tyro',
    // transactionLocalDateTime is terminal-local with no offset, so it is kept
    // verbatim here rather than guessed into a UTC createdAt.
    metadata: compactMap({
      terminalBusinessDay: context.terminalBusinessDay,
      transactionLocalDateTime: raw.transactionLocalDateTime,
      transactionStatus: raw.transactionStatus,
      locationId: raw.locationId,
      tid: raw.tid,
      paymentType: raw.paymentType,
      isReversal: raw.isReversal,
      acquirerActionCode: raw.acquirerActionCode,
      rrn: raw.rrn,
      tyroReference: raw.tyroReference,
      integratedTransactionId: raw.integratedTransactionId,
    }),
    raw,
  }
}
