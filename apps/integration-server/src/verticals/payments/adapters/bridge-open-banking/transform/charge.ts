/**
 * Bridge payment-request transaction -> canonical Charge.
 *
 * Bridge has no charges resource. Its pay-ins are payment requests
 * (GET /v3/payment/payment-requests,
 * https://docs.bridgeapi.io/reference/getpaymentrequests.md), and each
 * payment request holds a `transactions` array: the money that moves. One
 * transaction is one Charge. A request can hold several ("In the case of
 * single payments, where 1 payment request corresponds to 1 transaction",
 * https://docs.bridgeapi.io/docs/payments-statuses-2.md), so the Charge id is
 * `<payment request id>:<transaction id>`, which getCharge splits to read the
 * request back.
 *
 * Fields, from the GetPaymentRequest schema
 * (https://docs.bridgeapi.io/reference/getpaymentrequest.md):
 *   transaction `amount`   "The transaction amount" (number, float: major units)
 *   transaction `currency` "The transaction currency"
 *   transaction `label`    "The transaction label"
 *   transaction `status`   enum CREA, ACTC, PDNG, ACSC, RJCT, PART
 *   request `status_reason`, `created_at`, `updated_at`, `client_reference`
 *
 * Status, from payments-statuses-2.md: CREA "Payment has been created on
 * Bridge side", ACTC "Payment has been created on bank side", PDNG "the
 * payment has been confirmed and is awaiting execution by the bank", ACSC
 * "Payment has been executed by the bank", RJCT "Payment has been rejected".
 * PART is in the enum but described nowhere, so it maps to 'unknown'.
 */

import { majorToMinor } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'

export interface RawBridgeTransaction {
  id: string
  amount?: number
  currency?: string
  label?: string
  execution_date?: string
  status?: string
  client_reference?: string
  end_to_end_id?: string
  [key: string]: unknown
}

export interface RawBridgePaymentRequest {
  id: string
  status?: string
  status_reason?: string
  client_reference?: string
  payment_link_id?: string
  created_at?: string
  updated_at?: string
  transactions?: RawBridgeTransaction[]
  [key: string]: unknown
}

const STATUS: Record<string, ChargeStatus> = {
  CREA: 'pending',
  ACTC: 'pending',
  PDNG: 'pending',
  ACSC: 'succeeded',
  RJCT: 'failed',
}

export function chargeId(requestId: string, transactionId: string): string {
  return `${requestId}:${transactionId}`
}

export function transformCharge(
  request: RawBridgePaymentRequest,
  tx: RawBridgeTransaction,
): Charge {
  const id = chargeId(request.id, tx.id)
  if (typeof tx.currency !== 'string' || tx.currency === '') {
    throw new Error(`Bridge payment request transaction ${id} has no currency`)
  }
  const amount = majorToMinor(tx.amount, tx.currency)
  if (amount === undefined) {
    throw new Error(`Bridge payment request transaction ${id} has no amount`)
  }
  const status: ChargeStatus = (tx.status && STATUS[tx.status]) || 'unknown'
  const metadata: Record<string, string> = { payment_request_id: request.id, transaction_id: tx.id }
  if (tx.client_reference) metadata.client_reference = tx.client_reference
  if (tx.end_to_end_id) metadata.end_to_end_id = tx.end_to_end_id
  if (tx.execution_date) metadata.execution_date = tx.execution_date
  if (request.payment_link_id) metadata.payment_link_id = request.payment_link_id
  if (tx.status) metadata.bridge_status = tx.status
  return {
    id,
    externalId: id,
    amount,
    currency: tx.currency.toUpperCase(),
    status,
    description: tx.label ?? null,
    failureCode: tx.status === 'RJCT' ? (request.status_reason ?? null) : null,
    gateway: 'bridge-open-banking',
    metadata,
    createdAt: request.created_at ? new Date(request.created_at).toISOString() : null,
    updatedAt: request.updated_at ? new Date(request.updated_at).toISOString() : null,
    raw: { request, transaction: tx },
  }
}

/** Every transaction of a payment request, each as a Charge. */
export function transformPaymentRequest(request: RawBridgePaymentRequest): Charge[] {
  return (request.transactions ?? []).map((tx) => transformCharge(request, tx))
}
