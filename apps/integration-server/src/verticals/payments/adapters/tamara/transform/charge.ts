import type { Charge, ChargeStatus } from '../../../schema/charge'
import { moneyFields, pickCurrency, strMap, toIsoDatetime, type TamaraMoney } from './shared'

/**
 * Tamara has no first-class "charge" object; an *order* (identified by its
 * `order_id`) is the closest canonical equivalent. This shape covers the
 * `GET /orders/{order_id}` response — the order lifecycle, the embedded
 * consumer, the per-action amount roll-ups, and the nested transaction
 * sub-collections.
 *
 * Docs: https://docs.tamara.co/reference/getorderdetails
 */
export interface RawTamaraOrder {
  order_id?: string
  order_reference_id?: string
  order_number?: string
  description?: string
  status?: string
  payment_type?: string
  instalments?: number
  consumer?: TamaraConsumer
  total_amount?: TamaraMoney
  captured_amount?: TamaraMoney
  refunded_amount?: TamaraMoney
  canceled_amount?: TamaraMoney
  paid_amount?: TamaraMoney
  shipping_amount?: TamaraMoney
  tax_amount?: TamaraMoney
  settlement_status?: string
  settlement_date?: string | null
  created_at?: string
  store_code?: string
  transactions?: {
    captures?: Array<{ capture_id?: string; created_at?: string }>
    refunds?: Array<{ refund_id?: string; created_at?: string; updated_at?: string }>
    cancels?: Array<{ cancel_id?: string; created_at?: string }>
  }
  [k: string]: unknown
}

interface TamaraConsumer {
  first_name?: string
  last_name?: string
  email?: string
  phone_number?: string
  national_id?: string
  date_of_birth?: string
  is_first_order?: boolean | null
}

/**
 * Tamara order statuses (lower snake_case on the wire): `new`, `approved`,
 * `authorised`, `partially_captured`, `fully_captured`, `canceled`,
 * `declined`, `expired`, `partially_refunded`, `fully_refunded`.
 *
 * Docs: https://docs.tamara.co/docs/online-order-status-flow
 */
function mapStatus(raw: RawTamaraOrder): ChargeStatus {
  switch (String(raw.status ?? '').toLowerCase()) {
    case 'fully_captured':
      return 'succeeded'
    case 'fully_refunded':
      return 'refunded'
    case 'partially_refunded':
      return 'partially_refunded'
    case 'partially_captured':
    case 'authorised':
    case 'approved':
    case 'new':
      return 'pending'
    case 'declined':
      return 'failed'
    case 'canceled':
    case 'expired':
      return 'cancelled'
    default:
      return 'pending'
  }
}

function consumerName(c: TamaraConsumer | undefined): string | undefined {
  return [c?.first_name, c?.last_name].filter(Boolean).join(' ').trim() || undefined
}

function lastTimestamp(raw: RawTamaraOrder): string | undefined {
  const tx = raw.transactions
  const candidates: Array<string | undefined> = [
    raw.settlement_date ?? undefined,
    tx?.refunds?.[tx.refunds.length - 1]?.updated_at,
    tx?.refunds?.[tx.refunds.length - 1]?.created_at,
    tx?.cancels?.[tx.cancels.length - 1]?.created_at,
    tx?.captures?.[tx.captures.length - 1]?.created_at,
    raw.created_at,
  ]
  for (const c of candidates) {
    const iso = toIsoDatetime(c)
    if (iso) return iso
  }
  return undefined
}

export function transformCharge(raw: RawTamaraOrder): Charge {
  const total = moneyFields(raw.total_amount)
  const captured = moneyFields(raw.captured_amount)
  const refunded = moneyFields(raw.refunded_amount)
  const consumer = raw.consumer
  const status = mapStatus(raw)
  const currency = total.currency ?? captured.currency ?? raw.total_amount?.currency

  return {
    id: String(raw.order_id ?? ''),
    externalId: String(raw.order_id ?? ''),
    amount: total.amount,
    currency: pickCurrency(currency) ?? 'SAR',
    amountCaptured: raw.captured_amount ? captured.amount : undefined,
    amountRefunded: raw.refunded_amount ? refunded.amount : undefined,
    status,
    captured: status === 'succeeded' || captured.amount > 0,
    description: raw.description ?? undefined,
    receiptEmail: consumer?.email ?? undefined,
    gateway: 'tamara',
    metadata: strMap({
      order_reference_id: raw.order_reference_id,
      order_number: raw.order_number,
      payment_type: raw.payment_type,
      instalments: raw.instalments,
      consumer_name: consumerName(consumer),
      consumer_phone: consumer?.phone_number,
      settlement_status: raw.settlement_status,
      store_code: raw.store_code,
      tamara_status: raw.status,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: lastTimestamp(raw),
    raw,
  }
}
