/**
 * Yoco API `Payment` (GET /v1/payments/, GET /v1/payments/{payment_id}) to a
 * canonical Charge. Field names and enums are from the `Payment` schema in
 * https://developer.yoco.com/openapi/yoco-api-reference.json.
 */
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { optionalString, readId, readMoney, stringFields, type RawYocoMoney } from './shared'

export interface RawYocoPayment {
  id: string
  total_amount: RawYocoMoney
  refunded_amount?: RawYocoMoney
  currency?: string
  status?: string
  display_name?: string
  refunds?: Array<{ id: string }>
  created_at?: string
  updated_at?: string | null
  [k: string]: unknown
}

/** `PaymentStatus`: `"enum":["approved","cancelled","failed","pending"]`. */
function mapStatus(s: unknown): ChargeStatus {
  switch (s) {
    case 'approved':
      return 'succeeded'
    case 'cancelled':
      return 'cancelled'
    case 'failed':
      return 'failed'
    case 'pending':
      return 'pending'
    default:
      return 'unknown'
  }
}

/** Documented nullable reference fields kept as metadata. */
const META_KEYS = [
  'receipt_number',
  'payment_method',
  'payment_source',
  'order_id',
  'checkout_id',
  'external_id',
  'client_transaction_id',
  'card_machine_id',
  'staff_id',
] as const

export function transformCharge(raw: RawYocoPayment): Charge {
  const id = readId(raw.id, 'payment')
  const total = readMoney(raw.total_amount, 'total_amount', id)
  const refunded =
    raw.refunded_amount === undefined
      ? undefined
      : readMoney(raw.refunded_amount, 'refunded_amount', id)
  return {
    id,
    externalId: id,
    amount: total.amount,
    currency: total.currency,
    amountRefunded: refunded?.amount,
    status: mapStatus(raw.status),
    description: optionalString(raw.display_name),
    refundIds: Array.isArray(raw.refunds)
      ? raw.refunds.map((r) => readId(r?.id, `payment ${id} refund`))
      : undefined,
    gateway: 'yoco',
    metadata: stringFields(raw, META_KEYS),
    createdAt: optionalString(raw.created_at),
    updatedAt: optionalString(raw.updated_at),
    raw,
  }
}
