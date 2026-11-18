/**
 * Moov transfer (collected from a payer; see ../rails.ts) → canonical Charge.
 *
 * Fields, as documented on https://docs.moov.io/api/money-movement/transfers/list/:
 *   transferID, createdOn, status, amount {currency, value}, description,
 *   failureReason ("Reason for a transfer's failure."), invoiceID ("ID of the
 *   invoice that the transfer is associated with."), metadata ("Free-form
 *   key-value pair list."), refundedAmount, refunds[].refundID ("Identifier for
 *   the refund."), disputes[].disputeID, source.paymentMethodID and
 *   source.account.accountID (the payer: "The destination account pulls from a
 *   payment method owned by the source (payer)",
 *   https://docs.moov.io/guides/money-movement/payment-methods/).
 *
 * Status (https://docs.moov.io/guides/money-movement/events-and-statuses/):
 *   created "A transfer has been created", queued "A transfer that is part of a
 *   group will have the queued status until the preceding transfer has
 *   successfully completed", pending "The transfer is in progress, but not yet
 *   completed" → pending; completed "The transfer has completed" → succeeded;
 *   failed "The transfer did not succeed" → failed; canceled → cancelled;
 *   reversed "The transfer completed, but funds were returned to the source"
 *   → refunded (the payer got the money back).
 *
 * Moov documents no updated-at field on a transfer, so `updatedAt` is unset.
 */
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { requireMoovAmount, type RawMoovTransfer } from '../rails'

function mapStatus(status: string | undefined): ChargeStatus {
  switch (status) {
    case 'created':
    case 'queued':
    case 'pending':
      return 'pending'
    case 'completed':
      return 'succeeded'
    case 'failed':
      return 'failed'
    case 'canceled':
      return 'cancelled'
    case 'reversed':
      return 'refunded'
    default:
      return 'unknown'
  }
}

function requireId(raw: RawMoovTransfer): string {
  if (typeof raw.transferID !== 'string' || raw.transferID === '') {
    throw new Error('Moov transfer without transferID (ingestion error)')
  }
  return raw.transferID
}

export function transformCharge(raw: RawMoovTransfer): Charge {
  const id = requireId(raw)
  const { value, currency } = requireMoovAmount(raw.amount, `Moov transfer ${id}`)
  const charge: Charge = {
    id,
    externalId: id,
    amount: value,
    currency,
    status: mapStatus(raw.status),
    gateway: 'moov',
    metadata: { ...raw.metadata },
    raw,
  }
  if (raw.refundedAmount !== undefined) {
    charge.amountRefunded = requireMoovAmount(
      raw.refundedAmount,
      `Moov transfer ${id} refundedAmount`,
    ).value
  }
  if (raw.source?.account?.accountID) charge.customerId = raw.source.account.accountID
  if (raw.source?.paymentMethodID) charge.paymentMethodId = raw.source.paymentMethodID
  if (raw.invoiceID) charge.invoiceId = raw.invoiceID
  if (raw.description !== undefined) charge.description = raw.description
  if (raw.failureReason !== undefined) charge.failureCode = raw.failureReason
  if (raw.refunds) {
    charge.refundIds = raw.refunds.map((r) => r.refundID).filter((r): r is string => !!r)
  }
  if (raw.disputes) {
    charge.disputeIds = raw.disputes.map((d) => d.disputeID).filter((d): d is string => !!d)
  }
  if (raw.createdOn !== undefined) charge.createdAt = raw.createdOn
  return charge
}
