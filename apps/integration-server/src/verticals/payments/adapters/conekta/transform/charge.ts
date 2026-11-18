/**
 * Conekta is order-centric: an **Order** is the unit that carries the
 * amount, currency, customer and payment status — so it maps onto the
 * canonical **Charge**. The underlying `charges[]` array on the order holds
 * the individual gateway authorisations; we surface the first charge's id as
 * the `paymentMethodId` hint and use the order's own id as the canonical id
 * (refunds are taken against the order, not the charge).
 *
 * Money is in centavos (minor units). Timestamps are Unix epoch **seconds**
 * and must be coerced to strict ISO-8601.
 *
 * Refs:
 *   https://developers.conekta.com/reference/getorders
 *   https://developers.conekta.com/reference/getorderbyid
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, strMap } from './shared'

export interface RawConektaCharge {
  id?: string
  amount?: number
  currency?: string
  status?: string
  payment_method?: { object?: string; type?: string } & Record<string, unknown>
  paid_at?: number
  created_at?: number
  [k: string]: unknown
}

export interface RawConektaOrderChargesList {
  object?: string
  has_more?: boolean
  data?: RawConektaCharge[]
  [k: string]: unknown
}

export interface RawConektaCustomerInfo {
  object?: string
  name?: string
  email?: string
  phone?: string
  customer_id?: string
  corporate?: boolean
  [k: string]: unknown
}

export interface RawConektaOrder {
  id?: string
  object?: string
  amount?: number
  amount_refunded?: number
  currency?: string
  payment_status?: string
  customer_info?: RawConektaCustomerInfo
  charges?: RawConektaOrderChargesList
  created_at?: number
  updated_at?: number
  metadata?: Record<string, unknown>
  livemode?: boolean
  [k: string]: unknown
}

/**
 * Conekta order `payment_status` values: `pending_payment`, `paid`,
 * `partially_refunded`, `refunded`, `declined`, `expired`, `voided`,
 * `charged_back`, `pre_authorized`.
 */
function mapStatus(raw: RawConektaOrder): ChargeStatus {
  switch ((raw.payment_status ?? '').toLowerCase()) {
    case 'paid':
      return 'succeeded'
    case 'partially_refunded':
      return 'partially_refunded'
    case 'refunded':
      return 'refunded'
    case 'declined':
    case 'expired':
      return 'failed'
    case 'voided':
      return 'cancelled'
    case 'charged_back':
      return 'disputed'
    case 'pending_payment':
    case 'pre_authorized':
      return 'pending'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawConektaOrder): Charge {
  const firstCharge = raw.charges?.data?.[0]
  const paymentStatus = (raw.payment_status ?? '').toLowerCase()
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    amount: raw.amount ?? 0,
    currency: pickCurrency(raw.currency),
    amountRefunded: raw.amount_refunded ?? undefined,
    status: mapStatus(raw),
    captured: paymentStatus === 'paid' ? true : undefined,
    customerId: raw.customer_info?.customer_id,
    receiptEmail: raw.customer_info?.email,
    paymentMethodId: firstCharge?.id,
    failureMessage:
      typeof firstCharge?.['failure_message'] === 'string'
        ? (firstCharge['failure_message'] as string)
        : undefined,
    gateway: 'conekta',
    metadata: strMap(raw.metadata),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
