import type { Payout, PayoutStatus } from '../../../schema/payout'
import { toIsoDatetime } from '@opensteward/shared'
import { pickCurrency, strMap, toMinorUnits } from './shared'

/**
 * Decentro payout response (POST /v3/core_banking/money_transfer/initiate).
 *
 * The API returns a top-level `decentro_txn_id` plus a `data` sub-object that
 * carries the final `transaction_status` and `transfer_type`. The amount is
 * reflected in decimal rupees on the request side; the response does not echo it
 * back, so the caller threads `transfer_amount` from the request context when
 * known.
 *
 * Docs: https://docs.decentro.tech/reference/payments_api-initiate-payout-v3
 */
export interface RawDecentroPayoutData {
  transaction_status?: string
  transactionStatus?: string
  transaction_status_description?: string
  transactionStatusDescription?: string
  transfer_type?: string
  transferType?: string
  bank_reference_number?: string
  bankReferenceNumber?: string
  beneficiary_name?: string
  beneficiaryName?: string
  [k: string]: unknown
}

export interface RawDecentroPayout {
  decentro_txn_id?: string
  decentroTxnId?: string
  reference_id?: string
  referenceId?: string
  api_status?: string
  apiStatus?: string
  status?: string
  message?: string
  response_key?: string
  responseKey?: string
  /** Amount in decimal rupees (only present if the caller echoes it back). */
  transfer_amount?: number | string
  transferAmount?: number | string
  data?: RawDecentroPayoutData
  [k: string]: unknown
}

/** Caller-supplied context the payout response itself does not carry back. */
export interface PayoutContext {
  amount?: number | string
}

function mapStatus(raw: RawDecentroPayout): PayoutStatus {
  const d = raw.data ?? {}
  const s = String(
    d.transaction_status ?? d.transactionStatus ?? raw.status ?? raw.api_status ?? raw.apiStatus ?? '',
  ).toUpperCase()
  switch (s) {
    case 'SUCCESS':
      return 'paid'
    case 'PENDING':
    case 'REQUEST_UNINITIALIZED':
      return 'in_transit'
    case 'FAILURE':
    case 'FAILED':
      return 'failed'
    default:
      return 'pending'
  }
}

export function transformPayout(raw: RawDecentroPayout, context: PayoutContext = {}): Payout {
  const d = raw.data ?? {}
  const id = String(raw.decentro_txn_id ?? raw.decentroTxnId ?? raw.reference_id ?? raw.referenceId ?? '')
  const amountRaw = context.amount ?? raw.transfer_amount ?? raw.transferAmount
  const transferType = d.transfer_type ?? d.transferType
  const failureDescription =
    (mapStatus(raw) === 'failed')
      ? (d.transaction_status_description ?? d.transactionStatusDescription ?? raw.message ?? undefined)
      : undefined

  return {
    id,
    externalId: id,
    amount: toMinorUnits(amountRaw) ?? 0,
    currency: pickCurrency(),
    status: mapStatus(raw),
    method: 'standard',
    statementDescriptor: d.beneficiary_name ?? d.beneficiaryName ?? undefined,
    failureCode: (mapStatus(raw) === 'failed') ? (raw.response_key ?? raw.responseKey ?? undefined) : undefined,
    failureMessage: failureDescription,
    gateway: 'decentro',
    metadata: strMap({
      reference_id: raw.reference_id ?? raw.referenceId,
      transfer_type: transferType,
      bank_reference_number: d.bank_reference_number ?? d.bankReferenceNumber,
      transaction_status_description: d.transaction_status_description ?? d.transactionStatusDescription,
    }),
    createdAt: toIsoDatetime(raw.created_at ?? raw.createdAt),
    updatedAt: toIsoDatetime(raw.updated_at ?? raw.updatedAt),
    raw,
  }
}
