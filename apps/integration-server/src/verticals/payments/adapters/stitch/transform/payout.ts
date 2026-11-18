/**
 * Stitch Disbursement -> canonical Payout.
 *
 * Fields from https://docs.stitch.money/api/objects/disbursement:
 * "id : ID !", "amount : Money !", "nonce : String !", "beneficiaryReference : String !",
 * "externalReference : String", "status : DisbursementStatus !", "created : Date !".
 *
 * Status union (https://docs.stitch.money/api/unions/disbursement-status):
 * DisbursementPending | DisbursementPaused | DisbursementSubmitted |
 * DisbursementCompleted | DisbursementError | DisbursementCancelled | DisbursementReversed.
 * Per-status fields from the documented GetDisbursementStatus query
 * (https://docs.stitch.money/payment-products/payouts/disbursements):
 * Completed { date expectedSettlement }, Error { date disbursementErrorReason
 * disbursementErrorDescription }, Reversed { date disbursementReversedDescription
 * disbursementReversedReason }, Cancelled { date disbursementCancelledReason }.
 */

import type { Payout, PayoutStatus } from '../../../schema/payout'
import { moneyToMinor, type RawStitchMoney } from '../money'
import { toIsoDatetime } from './shared'

export interface RawStitchDisbursementStatus {
  __typename: string
  date?: string | null
  expectedSettlement?: string | null
  disbursementErrorReason?: string | null
  disbursementErrorDescription?: string | null
  disbursementReversedReason?: string | null
  disbursementReversedDescription?: string | null
  disbursementPausedReason?: string | null
  disbursementCancelledReason?: string | null
}

export interface RawStitchDisbursement {
  id: string
  amount: RawStitchMoney
  nonce?: string | null
  beneficiaryReference?: string | null
  externalReference?: string | null
  linkedAccountId?: string | null
  status?: RawStitchDisbursementStatus | null
  created?: string | null
}

/**
 * Status table (https://docs.stitch.money/payment-products/payouts/disbursements):
 * Pending "pending processing at the bank"; Paused "has been paused and requires
 * interaction" -> pending; Submitted "has been submitted to the bank" -> in_transit;
 * Completed "successfully processed and cleared at the bank" -> paid; Error "failed to
 * complete" -> failed; Cancelled -> cancelled; Reversed "reversed by the bank after
 * completion" -> failed.
 */
function mapStatus(typename: string | undefined): PayoutStatus {
  switch (typename) {
    case 'DisbursementPending':
    case 'DisbursementPaused':
      return 'pending'
    case 'DisbursementSubmitted':
      return 'in_transit'
    case 'DisbursementCompleted':
      return 'paid'
    case 'DisbursementError':
    case 'DisbursementReversed':
      return 'failed'
    case 'DisbursementCancelled':
      return 'cancelled'
    default:
      return 'unknown'
  }
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined
}

export function transformPayout(raw: RawStitchDisbursement): Payout {
  if (typeof raw?.id !== 'string' || !raw.id) throw new Error('Stitch disbursement has no id')
  const { amount, currency } = moneyToMinor(raw.amount, `disbursement ${raw.id}`)
  const s = raw.status
  const typename = s?.__typename
  const failureCode =
    typename === 'DisbursementError'
      ? str(s?.disbursementErrorReason)
      : typename === 'DisbursementReversed'
        ? str(s?.disbursementReversedReason)
        : undefined
  const failureMessage =
    typename === 'DisbursementError'
      ? str(s?.disbursementErrorDescription)
      : typename === 'DisbursementReversed'
        ? str(s?.disbursementReversedDescription)
        : undefined
  return {
    id: raw.id,
    externalId: raw.id,
    amount,
    currency,
    status: mapStatus(typename),
    arrivalDate:
      typename === 'DisbursementCompleted' ? toIsoDatetime(s?.expectedSettlement) : undefined,
    statementDescriptor: str(raw.beneficiaryReference),
    failureCode,
    failureMessage,
    gateway: 'stitch',
    metadata: {},
    createdAt: toIsoDatetime(raw.created),
    raw,
  }
}
