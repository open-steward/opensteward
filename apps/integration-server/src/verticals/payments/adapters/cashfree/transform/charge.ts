import { toIsoDatetime } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, strMap, toMinorUnits } from './shared'

/**
 * Cashfree exposes two charge-shaped objects:
 *   - the Order   (`GET /orders/{order_id}`) — carries customer + order-level
 *     status (ACTIVE / PAID / EXPIRED / TERMINATED / TERMINATION_REQUESTED).
 *   - the Payment (`GET /orders/{order_id}/payments[/{cf_payment_id}]`) — one
 *     attempt against the order with the real transaction status.
 *
 * Both collapse onto the canonical `Charge`. We accept a union and read
 * whichever fields are present.
 */
export interface RawCashfreeOrder {
  cf_order_id?: string | number
  order_id?: string
  order_amount?: number | string
  order_currency?: string
  order_status?: string
  order_note?: string | null
  order_expiry_time?: string
  created_at?: string
  customer_details?: {
    customer_id?: string
    customer_email?: string
    customer_phone?: string
    customer_name?: string
  }
  order_tags?: Record<string, unknown> | null
  [k: string]: unknown
}

export interface RawCashfreePayment {
  cf_payment_id?: string | number
  order_id?: string
  payment_amount?: number | string
  payment_currency?: string
  payment_status?: string
  payment_message?: string
  payment_time?: string
  payment_completion_time?: string
  payment_group?: string
  bank_reference?: string
  error_details?: { error_code?: string; error_description?: string } | null
  [k: string]: unknown
}

export type RawCashfreeCharge = RawCashfreeOrder & RawCashfreePayment

/** Map a Cashfree payment-attempt status to the canonical charge status. */
function mapPaymentStatus(raw: string): ChargeStatus {
  switch (raw.toUpperCase()) {
    case 'SUCCESS':
      return 'succeeded'
    case 'PENDING':
    case 'NOT_ATTEMPTED':
      return 'pending'
    case 'FAILED':
    case 'USER_DROPPED':
      return 'failed'
    case 'VOID':
    case 'CANCELLED':
      return 'cancelled'
    default:
      return 'pending'
  }
}

/** Map an order-level status to the canonical charge status. */
function mapOrderStatus(raw: string): ChargeStatus {
  switch (raw.toUpperCase()) {
    case 'PAID':
      return 'succeeded'
    case 'ACTIVE':
      return 'pending'
    case 'EXPIRED':
    case 'TERMINATED':
    case 'TERMINATION_REQUESTED':
      return 'cancelled'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawCashfreeCharge): Charge {
  const isPayment = raw.payment_status != null || raw.cf_payment_id != null
  const amountMajor = isPayment ? raw.payment_amount : raw.order_amount
  const status = isPayment
    ? mapPaymentStatus(String(raw.payment_status ?? ''))
    : mapOrderStatus(String(raw.order_status ?? ''))

  const id = isPayment
    ? String(raw.cf_payment_id ?? raw.order_id ?? '')
    : String(raw.order_id ?? raw.cf_order_id ?? '')

  const failureMessage = raw.error_details?.error_description ?? raw.payment_message
  const failureCode = raw.error_details?.error_code

  return {
    id,
    externalId: id,
    amount: toMinorUnits(amountMajor),
    currency: pickCurrency(raw.payment_currency ?? raw.order_currency),
    status,
    captured: status === 'succeeded' ? true : undefined,
    capturedAt: status === 'succeeded' ? toIsoDatetime(raw.payment_completion_time) : undefined,
    customerId: raw.customer_details?.customer_id
      ? String(raw.customer_details.customer_id)
      : undefined,
    receiptEmail: raw.customer_details?.customer_email ?? undefined,
    description: raw.order_note ?? undefined,
    failureCode: failureCode ?? undefined,
    failureMessage: failureMessage ?? undefined,
    gateway: 'cashfree',
    metadata: strMap({
      order_id: raw.order_id,
      payment_group: raw.payment_group,
      bank_reference: raw.bank_reference,
      payment_status: raw.payment_status,
      order_status: raw.order_status,
      ...raw.order_tags,
    }),
    createdAt: toIsoDatetime(raw.payment_time ?? raw.created_at),
    updatedAt: toIsoDatetime(raw.payment_completion_time ?? raw.payment_time ?? raw.created_at),
    raw,
  }
}
