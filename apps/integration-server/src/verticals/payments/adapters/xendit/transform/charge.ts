import { toIsoDatetime } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, strMap, toMinorAmount } from './shared'

/**
 * Xendit Payment Request object (Payment Requests API — v2).
 *
 * Xendit's Payment Request is the canonical "charge" resource. It carries the
 * amount, currency, customer, payment method, and lifecycle status. Refunds
 * reference it via `payment_request_id`.
 *
 * Statuses: PENDING, REQUIRES_ACTION, RUNNING, SUCCEEDED, FAILED, AWAITING_CAPTURE, CAPTURED,
 * VOIDED, REQUIRES_CONFIRMATION.
 *
 * https://docs.xendit.co/apidocs/create-payment-request
 */
export interface RawXenditPaymentRequest {
  id?: string
  reference_id?: string | null
  business_id?: string | null
  customer_id?: string | null
  customer?: { id?: string; reference_id?: string; [k: string]: unknown } | null
  amount?: number
  currency?: string
  capture_method?: 'AUTOMATIC' | 'MANUAL' | string | null
  status?:
    | 'PENDING'
    | 'REQUIRES_ACTION'
    | 'RUNNING'
    | 'SUCCEEDED'
    | 'FAILED'
    | 'AWAITING_CAPTURE'
    | 'CAPTURED'
    | 'VOIDED'
    | 'REQUIRES_CONFIRMATION'
    | string
  payment_method?: {
    id?: string
    type?: string
    status?: string
    [k: string]: unknown
  } | null
  invoice_id?: string | null
  description?: string | null
  failure_code?: string | null
  capture_amount?: number | null
  refunded_amount?: number | null
  metadata?: Record<string, unknown> | null
  created?: string | null
  updated?: string | null
  [k: string]: unknown
}

function mapStatus(raw: RawXenditPaymentRequest): ChargeStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'SUCCEEDED':
    case 'CAPTURED':
      return 'succeeded'
    case 'FAILED':
      return 'failed'
    case 'VOIDED':
      return 'cancelled'
    case 'PENDING':
    case 'REQUIRES_ACTION':
    case 'RUNNING':
    case 'AWAITING_CAPTURE':
    case 'REQUIRES_CONFIRMATION':
      return 'pending'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawXenditPaymentRequest): Charge {
  const status = (raw.status ?? '').toUpperCase()
  const captured = status === 'SUCCEEDED' || status === 'CAPTURED'
  const customerId =
    raw.customer_id ?? raw.customer?.id ?? raw.customer?.reference_id ?? undefined

  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.reference_id ?? raw.id ?? ''),
    amount: toMinorAmount(raw.amount),
    currency: pickCurrency(raw.currency),
    amountCaptured: captured && raw.capture_amount != null
      ? toMinorAmount(raw.capture_amount)
      : captured
        ? toMinorAmount(raw.amount)
        : undefined,
    amountRefunded: raw.refunded_amount != null
      ? toMinorAmount(raw.refunded_amount)
      : undefined,
    status: mapStatus(raw),
    captured: captured ? true : undefined,
    customerId: customerId ? String(customerId) : undefined,
    paymentMethodId: raw.payment_method?.id
      ? String(raw.payment_method.id)
      : undefined,
    invoiceId: raw.invoice_id ? String(raw.invoice_id) : undefined,
    description: raw.description ?? undefined,
    failureCode: raw.failure_code ?? undefined,
    gateway: 'xendit',
    metadata: strMap({
      ...(raw.metadata ?? {}),
      capture_method: raw.capture_method,
      payment_method_type: raw.payment_method?.type,
      business_id: raw.business_id,
    }),
    createdAt: toIsoDatetime(raw.created),
    updatedAt: toIsoDatetime(raw.updated),
    raw,
  }
}
