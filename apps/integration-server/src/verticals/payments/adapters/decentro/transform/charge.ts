import type { Charge, ChargeStatus } from '../../../schema/charge'
import { toIsoDatetime } from '@opensteward/shared'
import { pickCurrency, strMap, toMinorUnits } from './shared'

/**
 * Decentro returns a "charge" (a UPI collection) in two slightly different
 * shapes depending on the endpoint:
 *
 *   POST /v3/payments/upi/link            → snake_case envelope, `data.upi_uris`
 *   GET  /v2/payments/transaction/status  → camelCase envelope, `data.transaction*`
 *
 * Both carry a Decentro transaction id (`decentro_txn_id` / `decentroTxnId`),
 * a transaction status, and an amount, so we accept a permissive shape and read
 * whichever spelling is present.
 */
export interface RawDecentroChargeData {
  transaction_status?: string
  transactionStatus?: string
  transaction_status_description?: string
  transactionStatusDescription?: string
  transaction_amount?: number | string
  transactionAmount?: number | string
  bank_reference_number?: string
  bankReferenceNumber?: string
  npci_txn_id?: string
  npciTxnId?: string
  payer_vpa?: string
  payee_vpa?: string
  upi_uris?: Record<string, string>
  [k: string]: unknown
}

export interface RawDecentroCharge {
  decentro_txn_id?: string
  decentroTxnId?: string
  reference_id?: string
  referenceId?: string
  api_status?: string
  status?: string
  amount?: number | string
  message?: string
  error_key?: string
  errorKey?: string
  data?: RawDecentroChargeData
  [k: string]: unknown
}

function pickStatusString(raw: RawDecentroCharge): string {
  const d = raw.data ?? {}
  return String(
    d.transaction_status ?? d.transactionStatus ?? raw.status ?? raw.api_status ?? '',
  ).toUpperCase()
}

function mapStatus(raw: RawDecentroCharge): ChargeStatus {
  switch (pickStatusString(raw)) {
    case 'SUCCESS':
      return 'succeeded'
    case 'PENDING':
    case 'REQUEST_UNINITIALIZED':
      return 'pending'
    case 'FAILURE':
    case 'FAILED':
    case 'EXPIRED':
      return 'failed'
    case 'REFUNDED':
      return 'refunded'
    case 'DISPUTED_AMOUNT':
      return 'disputed'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawDecentroCharge): Charge {
  const d = raw.data ?? {}
  const id = String(raw.decentro_txn_id ?? raw.decentroTxnId ?? raw.reference_id ?? raw.referenceId ?? '')
  const amountRaw = d.transaction_amount ?? d.transactionAmount ?? raw.amount
  const description =
    d.transaction_status_description ?? d.transactionStatusDescription ?? raw.message
  return {
    id,
    externalId: id,
    amount: toMinorUnits(amountRaw) ?? 0,
    currency: pickCurrency(),
    status: mapStatus(raw),
    description: description ?? undefined,
    failureCode: raw.error_key ?? raw.errorKey ?? undefined,
    gateway: 'decentro',
    metadata: strMap({
      reference_id: raw.reference_id ?? raw.referenceId,
      transaction_status: pickStatusString(raw),
      bank_reference_number: d.bank_reference_number ?? d.bankReferenceNumber,
      npci_txn_id: d.npci_txn_id ?? d.npciTxnId,
      payer_vpa: d.payer_vpa,
      payee_vpa: d.payee_vpa,
      common_uri: d.upi_uris?.common_uri,
    }),
    createdAt: toIsoDatetime(raw.created_at ?? raw.createdAt),
    updatedAt: toIsoDatetime(raw.updated_at ?? raw.updatedAt),
    raw,
  }
}
