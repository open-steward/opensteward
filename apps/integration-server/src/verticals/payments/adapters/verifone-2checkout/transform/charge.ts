/**
 * 2Checkout Order ↔ canonical Charge.
 *
 * 2Checkout's unit of payment is the Order (`/orders/`). `RefNo` is the stable
 * 2Checkout reference; `OrderNo` is the human-facing order number. Money rides
 * as a major-unit decimal (`GrossPrice`/`NetPrice`) plus a `Currency` code.
 * Customer identity lives on `BillingDetails`.
 *
 * Docs: https://docs.2checkout.com/get-started-with-the-2checkout-api
 */
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { toIsoDatetime } from '@opensteward/shared'
import { pickCurrency, pickStr, strMap, toMinorUnits } from './shared'

export interface RawVerifone2checkoutBillingDetails {
  FirstName?: string | null
  LastName?: string | null
  Email?: string | null
  Phone?: string | null
  CountryCode?: string | null
  [k: string]: unknown
}

export interface RawVerifone2checkoutOrder {
  RefNo?: string | number
  OrderNo?: string | number
  ExternalReference?: string | null
  Status?: string
  ApproveStatus?: string
  Currency?: string
  NetPrice?: string | number
  GrossPrice?: string | number
  OrderDate?: string
  CustomerReference?: string | number | null
  BillingDetails?: RawVerifone2checkoutBillingDetails | null
  PaymentDetails?: { Type?: string; Currency?: string } | null
  Items?: Array<Record<string, unknown>> | null
  [k: string]: unknown
}

/**
 * Map a 2Checkout order status onto the canonical ChargeStatus. 2Checkout
 * orders move through `PENDING` → `AUTHRECEIVED`/`COMPLETE` → `REFUND` etc.
 */
function mapStatus(raw: RawVerifone2checkoutOrder): ChargeStatus {
  switch ((raw.Status ?? '').toUpperCase()) {
    case 'COMPLETE':
    case 'AUTHRECEIVED':
      return 'succeeded'
    case 'PENDING':
    case 'PENDINGAPPROVAL':
      return 'pending'
    case 'REFUND':
      return 'refunded'
    case 'PARTIAL_REFUND':
      return 'partially_refunded'
    case 'CANCELED':
    case 'CANCELLED':
      return 'cancelled'
    case 'INVALID':
    case 'REVERSED':
      return 'failed'
    case 'CHARGEBACK':
      return 'disputed'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawVerifone2checkoutOrder): Charge {
  const currency = pickCurrency(raw.Currency ?? raw.PaymentDetails?.Currency)
  const billing = raw.BillingDetails ?? undefined
  const refNo = String(raw.RefNo ?? raw.OrderNo ?? '')
  return {
    id: refNo,
    externalId: refNo,
    amount: toMinorUnits(raw.GrossPrice ?? raw.NetPrice, currency) ?? 0,
    currency,
    status: mapStatus(raw),
    customerId: pickStr(raw.CustomerReference),
    receiptEmail: pickStr(billing?.Email),
    gateway: 'verifone-2checkout',
    metadata: strMap({
      orderNo: raw.OrderNo,
      externalReference: raw.ExternalReference,
      approveStatus: raw.ApproveStatus,
      paymentType: raw.PaymentDetails?.Type,
      netPrice: raw.NetPrice,
    }),
    createdAt: toIsoDatetime(raw.OrderDate),
    raw,
  }
}
