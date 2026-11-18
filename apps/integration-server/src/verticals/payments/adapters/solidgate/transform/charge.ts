import type { Charge, ChargeStatus } from '../../../schema/charge'
import { sgDatetime, strMap } from './shared'

/**
 * A card order, as the card-orders report returns it
 * (POST https://reports.solidgate.com/api/v1/card-orders, `orders[]`) or as
 * POST https://pay.solidgate.com/api/v1/status returns it (`order`). Only the
 * documented fields this transform reads are typed.
 */
export interface RawSolidgateOrder {
  order_id: string
  order_description?: string
  /** "Original order amount." /status: "Order amount in the smallest currency unit." */
  amount: number
  currency: string
  status: string
  /** Report only: "Refund status of the order." [partial|full|failed] */
  refund?: string | null
  refunded_amount?: number | null
  refunded_currency?: string | null
  settled_amount?: number | null
  settled_currency?: string | null
  customer_account_id?: string
  subscription_id?: string | null
  error_code?: string
  created_at?: string
  updated_at?: string
  order_metadata?: Record<string, unknown>
  transactions?: Array<{ id: string; operation: string }>
}

/**
 * Order statuses, from
 * https://docs.solidgate.com/payments/card-payments/card-payments-insights/payment-lifecycle/:
 * processing / 3ds_verify / auth_ok are non-final; auth_failed "a failure in
 * reserving funds"; void_ok "The reservation of funds has been voided";
 * settle_ok "Reserved funds have been successfully captured"; partial_settled
 * "A portion of the funds has been captured"; refunded "The order funds were
 * transferred back to the cardholder".
 */
const STATUS: Record<string, ChargeStatus> = {
  processing: 'pending',
  '3ds_verify': 'pending',
  auth_ok: 'pending',
  auth_failed: 'failed',
  void_ok: 'cancelled',
  settle_ok: 'succeeded',
  partial_settled: 'succeeded',
  refunded: 'refunded',
}

export function transformCharge(raw: RawSolidgateOrder): Charge {
  let status: ChargeStatus = STATUS[raw.status] ?? 'unknown'
  if (status === 'succeeded' && raw.refund === 'partial') status = 'partially_refunded'
  const currency = raw.currency.toUpperCase()
  const refundIds = (raw.transactions ?? [])
    .filter((t) => t.operation === 'refund')
    .map((t) => t.id)
  return {
    id: raw.order_id,
    externalId: raw.order_id,
    amount: raw.amount,
    currency,
    amountRefunded:
      typeof raw.refunded_amount === 'number' && raw.refunded_currency?.toUpperCase() === currency
        ? raw.refunded_amount
        : undefined,
    amountCaptured:
      typeof raw.settled_amount === 'number' && raw.settled_currency?.toUpperCase() === currency
        ? raw.settled_amount
        : undefined,
    status,
    customerId: raw.customer_account_id || undefined,
    subscriptionId: raw.subscription_id || undefined,
    description: raw.order_description || undefined,
    failureCode: raw.error_code || undefined,
    ...(raw.transactions ? { refundIds } : {}),
    gateway: 'solidgate',
    metadata: strMap(raw.order_metadata),
    createdAt: sgDatetime(raw.created_at),
    updatedAt: sgDatetime(raw.updated_at),
    raw,
  }
}
