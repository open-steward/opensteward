import { majorToMinor, toIsoDatetime } from '@opensteward/shared'
import type { Dispute, DisputeStatus } from '../../../schema/dispute'

/**
 * A row of GET /Query/chargebacks/{entry}, also the body of GET
 * /ChargeBacks/read/{Id}. Only the fields read here.
 * https://docs.payabli.com/developers/api-reference/chargebacks/get-list-of-chargebacks-and-returned-transactions-for-an-entrypoint.md
 */
export interface RawPayabliChargeback {
  /** "Unique identifier of the record." */
  Id?: number | null
  /** "Transaction ID for the payment." */
  PaymentTransId?: string | null
  /** "Net amount after deductions." */
  NetAmount?: number | null
  /** "Status of the chargeback or ACH return." */
  Status?: number | null
  Reason?: string | null
  ReasonCode?: string | null
  CaseNumber?: string | null
  /** "Time that a response to a chargeback is due, in UTC." */
  ReplyBy?: string | null
  /** "Timestamp of when record was created, in UTC." */
  CreatedAt?: string | null
  /** "Payment data associated with the transaction." */
  PaymentData?: { paymentDetails?: { currency?: string | null } | null } | null
  /** The original transaction, a `TransactionQueryRecords`. */
  Transaction?: {
    PaymentData?: { paymentDetails?: { currency?: string | null } | null } | null
  } | null
  [k: string]: unknown
}

/**
 * `Status`: "0: Open (chargebacks only) - 1: Pending (chargebacks only) -
 * 2: ClosedWon (chargebacks only) - 3: ClosedLost (chargebacks only) - 4: ACH
 * return (any Nacha return code except R29) - 5: AchDispute (R29 only — debit
 * block)". ACH returns have no canonical dispute status.
 */
function mapStatus(s: number | null | undefined): DisputeStatus {
  switch (s) {
    case 0:
      return 'needs_response'
    case 1:
      return 'under_review'
    case 2:
      return 'won'
    case 3:
      return 'lost'
    default:
      return 'unknown'
  }
}

export function transformDispute(raw: RawPayabliChargeback, connectionCurrency?: string): Dispute {
  if (raw.Id == null) throw new Error('Payabli chargeback has no Id')
  const id = String(raw.Id)
  if (!raw.PaymentTransId) throw new Error(`Payabli chargeback ${id} has no PaymentTransId`)
  // Both documented objects describe the original transaction; the documented
  // examples populate `currency` on the top-level PaymentData of GET
  // /ChargeBacks/read/{Id} and on Transaction.PaymentData of the list.
  const currency =
    raw.PaymentData?.paymentDetails?.currency ??
    raw.Transaction?.PaymentData?.paymentDetails?.currency ??
    connectionCurrency
  if (!currency) {
    throw new Error(
      `Payabli chargeback ${id} has no paymentDetails.currency and the connection has no currency`,
    )
  }
  const amount = majorToMinor(raw.NetAmount, currency)
  if (amount === undefined) throw new Error(`Payabli chargeback ${id} has no NetAmount`)
  const metadata: Record<string, string> = {}
  if (raw.Reason) metadata.reason = raw.Reason
  if (raw.ReasonCode) metadata.reasonCode = raw.ReasonCode
  if (raw.CaseNumber) metadata.caseNumber = raw.CaseNumber
  return {
    id,
    externalId: id,
    chargeId: raw.PaymentTransId,
    amount,
    currency,
    status: mapStatus(raw.Status),
    evidenceDueBy: toIsoDatetime(raw.ReplyBy),
    gateway: 'payabli',
    metadata,
    createdAt: toIsoDatetime(raw.CreatedAt),
    raw,
  }
}
