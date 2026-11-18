/**
 * Stitch PaymentInitiationRequest (Pay By Bank payment request) -> canonical Charge.
 *
 * Fields from https://docs.stitch.money/api/objects/payment-initiation-request:
 * "id : ID !", "created : Date !", "updated : Date !", "amount : Money !",
 * "beneficiaryReference : String !", "externalReference : String",
 * "state : PaymentInitiationRequestState !", "metadata : Json".
 *
 * State union (https://docs.stitch.money/api/unions/payment-initiation-request-state):
 * PaymentInitiationRequestCompleted | PaymentInitiationRequestManuallyCompleted |
 * PaymentInitiationRequestCancelled | PaymentInitiationRequestExpired |
 * PaymentInitiationRequestPending.
 */

import type { Charge, ChargeStatus } from '../../../schema/charge'
import { moneyToMinor, type RawStitchMoney } from '../money'
import { toIsoDatetime, strMap } from './shared'

export interface RawStitchPaymentRequestState {
  __typename: string
  date?: string | null
  /** PaymentInitiationRequestCancelled: "reason : String !" */
  reason?: string | null
}

export interface RawStitchPaymentRequest {
  id: string
  created?: string | null
  updated?: string | null
  amount: RawStitchMoney
  beneficiaryReference?: string | null
  externalReference?: string | null
  metadata?: unknown
  state?: RawStitchPaymentRequestState | null
}

/**
 * "PaymentInitiationRequestCompleted: The payment to the beneficiary has been initiated."
 * "PaymentInitiationRequestManuallyCompleted: The payment request was manually marked as
 *  completed. No payment exists for the PaymentInitiationRequest." -> unknown (no payment).
 * "PaymentInitiationRequestCancelled: The payment has been cancelled and cannot be completed."
 * "PaymentInitiationRequestExpired: Payment initiation request expired before the user
 *  attempted to pay" -> cancelled (terminal, never paid).
 * "PaymentInitiationRequestPending: The payment has not yet been initiated, waiting for
 *  user to complete request"
 */
function mapStatus(typename: string | undefined): ChargeStatus {
  switch (typename) {
    case 'PaymentInitiationRequestCompleted':
      return 'succeeded'
    case 'PaymentInitiationRequestPending':
      return 'pending'
    case 'PaymentInitiationRequestCancelled':
    case 'PaymentInitiationRequestExpired':
      return 'cancelled'
    default:
      return 'unknown'
  }
}

export function transformCharge(raw: RawStitchPaymentRequest): Charge {
  if (typeof raw?.id !== 'string' || !raw.id) throw new Error('Stitch payment request has no id')
  const { amount, currency } = moneyToMinor(raw.amount, `payment request ${raw.id}`)
  const typename = raw.state?.__typename
  const ref = raw.beneficiaryReference
  return {
    id: raw.id,
    externalId: raw.id,
    amount,
    currency,
    status: mapStatus(typename),
    statementDescriptor: typeof ref === 'string' && ref && ref.length <= 64 ? ref : undefined,
    failureMessage:
      typename === 'PaymentInitiationRequestCancelled' && typeof raw.state?.reason === 'string'
        ? raw.state.reason
        : undefined,
    gateway: 'stitch',
    metadata: strMap(raw.metadata),
    createdAt: toIsoDatetime(raw.created),
    updatedAt: toIsoDatetime(raw.updated),
    raw,
  }
}
