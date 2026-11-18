/**
 * Fawry is order/transaction-centric: a charge response (and the status-v2
 * inquiry response) carries the amount, status, customer contact and payment
 * method — so it maps onto the canonical **Charge**. Fawry's `referenceNumber`
 * is its own transaction id; `merchantRefNumber` is the merchant-side id.
 *
 * Money is a decimal major unit (EGP) and must be converted to integer minor
 * units. `paymentTime` is Unix epoch **milliseconds** and is coerced to strict
 * ISO-8601.
 *
 * Refs:
 *   https://developer.fawrystaging.com/docs/server-apis/create-payment-refno-apis
 *   https://developer.fawrystaging.com/docs/server-apis/payment-notifications/get-payment-status-v2
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, strMap, toMinorUnits } from './shared'

/**
 * Shared shape for Fawry charge / status-v2 responses. Field names match the
 * wire payload exactly — Fawry is camelCase on the wire and uses
 * `customerMail` (not `customerEmail`) on responses. `paymentRefrenceNumber`
 * preserves Fawry's documented spelling.
 */
export interface RawFawryCharge {
  type?: string
  referenceNumber?: string
  merchantRefNumber?: string
  orderAmount?: number | string
  paymentAmount?: number | string
  fawryFees?: number | string
  shippingFees?: number | string
  paymentMethod?: string
  orderStatus?: string
  paymentTime?: number
  customerName?: string
  customerMobile?: string
  customerMail?: string
  customerProfileId?: string | number
  authNumber?: string
  paymentRefrenceNumber?: string
  failureErrorCode?: number | string
  failureReason?: string
  statusCode?: number | string
  statusDescription?: string
  signature?: string
  [k: string]: unknown
}

/**
 * Fawry `orderStatus` values: NEW, PAID, CANCELED, REFUNDED, EXPIRED,
 * PARTIAL_REFUNDED, FAILED, UNPAID, DELIVERED.
 */
function mapStatus(raw: RawFawryCharge): ChargeStatus {
  switch ((raw.orderStatus ?? '').toUpperCase()) {
    case 'PAID':
    case 'DELIVERED':
      return 'succeeded'
    case 'PARTIAL_REFUNDED':
      return 'partially_refunded'
    case 'REFUNDED':
      return 'refunded'
    case 'CANCELED':
    case 'EXPIRED':
      return 'cancelled'
    case 'FAILED':
      return 'failed'
    case 'NEW':
    case 'UNPAID':
      return 'pending'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawFawryCharge): Charge {
  const currency = pickCurrency(undefined)
  const orderMinor = toMinorUnits(raw.orderAmount)
  const status = mapStatus(raw)
  const paid = status === 'succeeded'
  return {
    id: String(raw.referenceNumber ?? raw.merchantRefNumber ?? ''),
    externalId: String(raw.referenceNumber ?? raw.merchantRefNumber ?? ''),
    amount: orderMinor,
    currency,
    amountCaptured: paid ? toMinorUnits(raw.paymentAmount) : undefined,
    status,
    captured: paid ? true : undefined,
    customerId: raw.customerProfileId != null ? String(raw.customerProfileId) : undefined,
    receiptEmail: raw.customerMail,
    failureCode: raw.failureErrorCode != null ? String(raw.failureErrorCode) : undefined,
    failureMessage: raw.failureReason,
    gateway: 'fawry',
    metadata: strMap({
      merchantRefNumber: raw.merchantRefNumber,
      paymentMethod: raw.paymentMethod,
      orderStatus: raw.orderStatus,
      fawryFees: raw.fawryFees,
      shippingFees: raw.shippingFees,
      customerMobile: raw.customerMobile,
      customerName: raw.customerName,
      authNumber: raw.authNumber,
      paymentRefrenceNumber: raw.paymentRefrenceNumber,
    }),
    createdAt: toIsoDatetime(raw.paymentTime),
    updatedAt: toIsoDatetime(raw.paymentTime),
    raw,
  }
}
