import type { Charge, ChargeStatus } from '../../../schema/charge'
import {
  pickCurrency,
  strMap,
  toIsoDatetime,
  toMinorUnits,
  type ScalapayMoney,
} from './shared'

/**
 * Scalapay has no first-class "charge" object; an *order/payment* (identified
 * by its `token`) is the closest canonical equivalent. This shape covers both
 * the transactional `GET /v2/payments/{token}` response and the flatter
 * `GET /v1/reporting/orders` list rows.
 */
export interface RawScalapayOrder {
  token?: string
  status?: string
  /** Reporting rows expose `merchantReference`; transactional rows nest it. */
  merchantReference?: string
  totalAmount?: ScalapayMoney
  /** Some reporting rows flatten the amount/currency. */
  amount?: string | number
  currency?: string
  orderDetails?: {
    consumer?: ScalapayConsumer
    merchantReference?: string
  }
  consumer?: ScalapayConsumer
  checkoutUrl?: string
  expires?: string
  createdAt?: string
  orderDate?: string
  chargedAt?: string
  [k: string]: unknown
}

interface ScalapayConsumer {
  email?: string
  givenNames?: string
  surname?: string
  phoneNumber?: string
}

/**
 * Scalapay statuses (uppercase on the wire): AUTHORIZED, PENDING, CHARGED,
 * CANCELLED, EXPIRED, DECLINED, REFUNDED.
 * Docs: https://developers.scalapay.com/reference/get_v2-payments-token
 */
function mapStatus(raw: RawScalapayOrder): ChargeStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'CHARGED':
      return 'succeeded'
    case 'AUTHORIZED':
    case 'PENDING':
      return 'pending'
    case 'DECLINED':
    case 'FAILED':
      return 'failed'
    case 'REFUNDED':
      return 'refunded'
    case 'CANCELLED':
    case 'VOIDED':
    case 'EXPIRED':
      return 'cancelled'
    default:
      return 'pending'
  }
}

function consumerOf(raw: RawScalapayOrder): ScalapayConsumer | undefined {
  return raw.orderDetails?.consumer ?? raw.consumer
}

export function transformCharge(raw: RawScalapayOrder): Charge {
  const money = raw.totalAmount
  const currency = pickCurrency(money?.currency ?? raw.currency)
  const amount = toMinorUnits(money?.amount ?? raw.amount, currency)
  const consumer = consumerOf(raw)
  const status = mapStatus(raw)
  const merchantReference = raw.merchantReference ?? raw.orderDetails?.merchantReference

  return {
    id: String(raw.token ?? ''),
    externalId: String(raw.token ?? ''),
    amount,
    currency: currency ?? 'EUR',
    status,
    captured: status === 'succeeded',
    receiptEmail: consumer?.email ?? undefined,
    gateway: 'scalapay',
    metadata: strMap({
      merchantReference,
      consumerName:
        [consumer?.givenNames, consumer?.surname].filter(Boolean).join(' ') || undefined,
      consumerPhone: consumer?.phoneNumber,
      checkoutUrl: raw.checkoutUrl,
      scalapayStatus: raw.status,
    }),
    createdAt: toIsoDatetime(raw.createdAt ?? raw.orderDate),
    updatedAt: toIsoDatetime(raw.chargedAt ?? raw.createdAt ?? raw.orderDate),
    raw,
  }
}
