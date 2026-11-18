import { toIsoDatetime } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, strMap, toMinorUnits } from './shared'

/**
 * Juspay's Order Status response (`GET /orders/{order_id}`) is the canonical
 * charge. It carries order-level identity + amount, the customer block, the
 * order `status` (CREATED / PENDING / AUTHORIZED / CHARGED / FAILED / …) and
 * a nested `txn_detail` describing the underlying gateway transaction. The
 * same shape is returned (minus a settled status) by Create Order, so this
 * transform doubles as the create-response mapper.
 */
export interface RawJuspayTxnDetail {
  txn_id?: string
  txn_uuid?: string
  order_id?: string
  status?: string
  gateway?: string
  txn_amount?: number
  net_amount?: number
  currency?: string
  error_message?: string | null
  error_code?: string | null
  created?: string
  [k: string]: unknown
}

export interface RawJuspayOrder {
  id?: string
  order_id?: string
  merchant_id?: string
  amount?: number
  effective_amount?: number
  currency?: string
  status?: string
  status_id?: number
  txn_id?: string
  txn_uuid?: string
  payment_method?: string
  payment_method_type?: string
  gateway?: string
  gateway_reference_id?: string
  customer_id?: string
  customer_email?: string
  customer_phone?: string
  refunded?: boolean
  amount_refunded?: number
  resp_code?: string | null
  resp_message?: string | null
  bank_error_code?: string | null
  bank_error_message?: string | null
  date_created?: string
  txn_detail?: RawJuspayTxnDetail
  udf1?: string
  udf2?: string
  [k: string]: unknown
}

/** Map a Juspay order status to the canonical charge status. */
function mapStatus(raw: RawJuspayOrder): ChargeStatus {
  const status = (raw.status ?? '').toUpperCase()
  const refunded = raw.amount_refunded ?? 0
  const amount = raw.amount ?? 0
  if (raw.refunded === true || (refunded > 0 && amount > 0 && refunded >= amount)) {
    return 'refunded'
  }
  if (refunded > 0 && amount > 0 && refunded < amount) return 'partially_refunded'
  switch (status) {
    case 'CHARGED':
      return 'succeeded'
    case 'AUTHORIZED':
    case 'AUTHORIZING':
    case 'PENDING':
    case 'PENDING_VBV':
    case 'CREATED':
    case 'NEW':
    case 'COD_INITIATED':
      return 'pending'
    case 'AUTHENTICATION_FAILED':
    case 'AUTHORIZATION_FAILED':
    case 'FAILURE':
    case 'FAILED':
      return 'failed'
    case 'VOIDED':
    case 'CANCELLED':
    case 'TO_BE_CHARGED':
    case 'AUTO_REFUNDED':
      return 'cancelled'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawJuspayOrder): Charge {
  const txn = raw.txn_detail ?? {}
  const status = mapStatus(raw)
  const failureMessage =
    raw.bank_error_message ?? raw.resp_message ?? txn.error_message ?? undefined
  const failureCode = raw.bank_error_code ?? raw.resp_code ?? txn.error_code ?? undefined
  const amountRefunded = raw.amount_refunded != null ? toMinorUnits(raw.amount_refunded) : undefined

  return {
    id: String(raw.order_id ?? raw.id ?? ''),
    externalId: String(raw.id ?? raw.order_id ?? ''),
    amount: toMinorUnits(raw.amount),
    currency: pickCurrency(raw.currency ?? txn.currency),
    amountRefunded,
    status,
    captured: status === 'succeeded' ? true : undefined,
    customerId: raw.customer_id ?? undefined,
    receiptEmail: raw.customer_email ?? undefined,
    failureCode: failureCode ?? undefined,
    failureMessage: failureMessage ?? undefined,
    gateway: 'juspay',
    metadata: strMap({
      txn_id: raw.txn_id ?? txn.txn_id,
      txn_uuid: raw.txn_uuid ?? txn.txn_uuid,
      status: raw.status,
      payment_method: raw.payment_method,
      payment_method_type: raw.payment_method_type,
      payment_gateway: raw.gateway ?? txn.gateway,
      gateway_reference_id: raw.gateway_reference_id,
      customer_phone: raw.customer_phone,
      udf1: raw.udf1,
      udf2: raw.udf2,
    }),
    createdAt: toIsoDatetime(raw.date_created),
    updatedAt: toIsoDatetime(txn.created ?? raw.date_created),
    raw,
  }
}
