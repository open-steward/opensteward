import { majorToMinor, toIsoDatetime } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'

/**
 * A `TransactionQueryRecords` row of GET /Query/transactions/{entry}, also the
 * body of GET /MoneyIn/details/{transId}. Only the fields read here.
 * https://docs.payabli.com/developers/api-reference/query/get-list-of-transactions-for-an-entrypoint.md
 */
export interface RawPayabliTransaction {
  /** "Unique Transaction ID." */
  PaymentTransId?: string | null
  /** "Transaction date and time, in UTC." */
  TransactionTime?: string | null
  /** "Transaction total amount (including service fee or sub-charge)" */
  TotalAmount?: number | null
  /** "Status of transaction." */
  TransStatus?: number | null
  /** "The transaction's operation." */
  Operation?: string | null
  /** "Unique ID for the customer linked to the transaction." */
  PayorId?: number | null
  /** "Reference to the subscription that originated the transaction." */
  ScheduleReference?: number | null
  PaymentData?: {
    orderDescription?: string | null
    paymentDetails?: { currency?: string | null } | null
  } | null
  [k: string]: unknown
}

/**
 * `TransStatus`, from "Money in transaction status"
 * (https://docs.payabli.com/developers/references/money-in-statuses.md):
 * 11 Authorized, 1 Approved/Captured, 2 Declined (processor), 3 Declined
 * (technical), 5 Voided/Canceled, -1 and 0 Failed/Error, -4 Rejected,
 * -2 Blocked (risk), 10 Initiated.
 */
function mapStatus(s: number | null | undefined): ChargeStatus {
  switch (s) {
    case 1:
      return 'succeeded'
    case 10:
    case 11:
      return 'pending'
    case 2:
    case 3:
    case -1:
    case 0:
    case -4:
    case -2:
      return 'failed'
    case 5:
      return 'cancelled'
    default:
      return 'unknown'
  }
}

/**
 * `connectionCurrency` is the paypoint's currency from the connection, used
 * only when the row has no `PaymentData.paymentDetails.currency` ("The
 * currency for the transaction, `USD` or `CAD`.").
 */
export function transformCharge(raw: RawPayabliTransaction, connectionCurrency?: string): Charge {
  const id = raw.PaymentTransId
  if (!id) throw new Error('Payabli transaction has no PaymentTransId')
  const currency = raw.PaymentData?.paymentDetails?.currency ?? connectionCurrency
  if (!currency) {
    throw new Error(
      `Payabli transaction ${id} has no PaymentData.paymentDetails.currency and the connection has no currency`,
    )
  }
  const amount = majorToMinor(raw.TotalAmount, currency)
  if (amount === undefined) throw new Error(`Payabli transaction ${id} has no TotalAmount`)
  const status = mapStatus(raw.TransStatus)
  return {
    id,
    externalId: id,
    amount,
    currency,
    status,
    captured: raw.TransStatus === 1 ? true : undefined,
    customerId:
      typeof raw.PayorId === 'number' && raw.PayorId > 0 ? String(raw.PayorId) : undefined,
    subscriptionId:
      typeof raw.ScheduleReference === 'number' && raw.ScheduleReference > 0
        ? String(raw.ScheduleReference)
        : undefined,
    description: raw.PaymentData?.orderDescription || undefined,
    gateway: 'payabli',
    metadata: {},
    createdAt: toIsoDatetime(raw.TransactionTime),
    raw,
  }
}
