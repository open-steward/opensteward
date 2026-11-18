import type { Charge, ChargeStatus } from '../../../schema/charge'
import { toIsoDatetime } from '@opensteward/shared'
import { pickAmount, pickCurrency, pickStr, strMap } from './shared'

/**
 * APEXX Atomic transaction (a "charge" in canonical terms). APEXX surfaces a
 * status under `transaction_status` (older payloads use `status`); amounts are
 * integer minor units; `created`/`created_at` and `updated`/`last_status_update`
 * carry the timestamps.
 */
export interface RawApexxTransaction {
  _id?: string
  transaction_status?: string
  status?: string
  transaction_type?: string
  amount?: number | string
  currency?: string
  captured_amount?: number | string
  refunded_amount?: number | string
  capture_now?: boolean
  authorization_code?: string
  merchant_reference?: string
  customer_id?: string
  account?: string
  organisation?: string
  dynamic_descriptor?: string
  reason_code?: string | number
  reason_message?: string
  billing_address?: { email?: string; first_name?: string; last_name?: string } | null
  created?: string
  created_at?: string
  updated?: string
  last_status_update?: string
  [k: string]: unknown
}

function rawStatus(raw: RawApexxTransaction): string {
  return (raw.transaction_status ?? raw.status ?? '').toString().toUpperCase()
}

function mapStatus(raw: RawApexxTransaction): ChargeStatus {
  const status = rawStatus(raw)
  const amount = pickAmount(raw.amount) ?? 0
  const refunded = pickAmount(raw.refunded_amount) ?? 0
  if (status !== 'REFUNDED' && refunded > 0 && amount > 0 && refunded < amount) {
    return 'partially_refunded'
  }
  switch (status) {
    case 'REFUNDED':
      return 'refunded'
    case 'CAPTURED':
    case 'SETTLED':
    case 'COMPLETED':
    case 'SALE':
      return 'succeeded'
    case 'AUTHORISED':
    case 'AUTHORIZED':
    case 'PENDING':
    case '3DS_REQUIRED':
      return 'pending'
    case 'CANCELLED':
    case 'CANCELED':
    case 'VOIDED':
      return 'cancelled'
    case 'DECLINED':
    case 'FAILED':
    case 'ERROR':
      return 'failed'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawApexxTransaction): Charge {
  const id = pickStr(raw._id) ?? ''
  const reasonCode = raw.reason_code == null ? undefined : String(raw.reason_code)
  const status = mapStatus(raw)
  const failed = status === 'failed'
  return {
    id,
    externalId: id,
    amount: pickAmount(raw.amount) ?? 0,
    currency: pickCurrency(raw.currency),
    amountCaptured: pickAmount(raw.captured_amount),
    amountRefunded: pickAmount(raw.refunded_amount),
    status,
    captured: raw.capture_now,
    customerId: pickStr(raw.customer_id),
    description: pickStr(raw.merchant_reference),
    statementDescriptor: pickStr(raw.dynamic_descriptor),
    failureCode: failed ? reasonCode : undefined,
    failureMessage: failed ? pickStr(raw.reason_message) : undefined,
    receiptEmail: pickStr(raw.billing_address?.email),
    gateway: 'apexx',
    metadata: strMap({
      transaction_type: raw.transaction_type,
      merchant_reference: raw.merchant_reference,
      authorization_code: raw.authorization_code,
      reason_code: reasonCode,
      reason_message: raw.reason_message,
      organisation: raw.organisation,
    }),
    createdAt: toIsoDatetime(raw.created ?? raw.created_at),
    updatedAt: toIsoDatetime(raw.updated ?? raw.last_status_update),
    raw,
  }
}

/** Canonical Charge → APEXX `/payment/direct` body (snake_case on the wire). */
export function untransformCharge(c: Partial<Charge>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (c.amount !== undefined) out.amount = c.amount
  if (c.currency !== undefined) out.currency = c.currency.toUpperCase()
  if (c.customerId !== undefined) out.customer_id = c.customerId
  if (c.description !== undefined) out.merchant_reference = c.description
  if (c.statementDescriptor !== undefined) out.dynamic_descriptor = c.statementDescriptor
  if (c.captured !== undefined) out.capture_now = c.captured
  return out
}
