import { toIsoDatetime } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, strMap, asBool } from './shared'

/**
 * Paymob transaction object (the canonical "charge" for this gateway).
 *
 * A transaction is the result of paying a Paymob `order`. Status is encoded as
 * a set of boolean flags rather than a single enum: `success` + `pending` +
 * `is_refunded` + `is_voided` + `is_captured` + `is_auth` + `error_occured`.
 * The customer/billing contact is embedded on the order as `billing_data`
 * (Paymob has no standalone customer object), and the payment instrument is
 * described by `source_data` (card PAN suffix, wallet, kiosk, …).
 *
 * Money is in `amount_cents` (integer minor units). `merchant_order_id` is the
 * merchant-supplied reference we surface as the human-friendly external id when
 * present.
 */
export interface PaymobBillingData {
  email?: string | null
  phone_number?: string | null
  first_name?: string | null
  last_name?: string | null
  [k: string]: unknown
}

export interface PaymobOrder {
  id?: number | string
  merchant_order_id?: string | null
  amount_cents?: number
  currency?: string | null
  shipping_data?: PaymobBillingData | null
  [k: string]: unknown
}

export interface PaymobSourceData {
  pan?: string | null
  type?: string | null
  sub_type?: string | null
  [k: string]: unknown
}

export interface RawPaymobTransaction {
  id?: number | string
  amount_cents?: number
  currency?: string | null
  success?: boolean | string
  pending?: boolean | string
  is_refunded?: boolean | string
  is_voided?: boolean | string
  is_captured?: boolean | string
  is_capture?: boolean | string
  is_auth?: boolean | string
  is_standalone_payment?: boolean | string
  error_occured?: boolean | string
  data?: { message?: string | null; txn_response_code?: string | null } | null
  integration_id?: number | string | null
  order?: PaymobOrder | null
  source_data?: PaymobSourceData | null
  billing_data?: PaymobBillingData | null
  created_at?: string | null
  [k: string]: unknown
}

function mapStatus(raw: RawPaymobTransaction): ChargeStatus {
  if (asBool(raw.is_voided)) return 'cancelled'
  if (asBool(raw.is_refunded)) return 'refunded'
  if (asBool(raw.pending)) return 'pending'
  if (asBool(raw.success)) {
    // An authorisation that hasn't been captured yet is not a settled charge.
    if (asBool(raw.is_auth) && !asBool(raw.is_captured) && !asBool(raw.is_capture)) {
      return 'pending'
    }
    return 'succeeded'
  }
  if (asBool(raw.error_occured)) return 'failed'
  return 'pending'
}

export function transformCharge(raw: RawPaymobTransaction): Charge {
  const order = raw.order ?? undefined
  const billing = raw.billing_data ?? order?.shipping_data ?? undefined
  const captured = asBool(raw.is_captured) || asBool(raw.is_capture)
  return {
    id: String(raw.id ?? ''),
    externalId: String(order?.merchant_order_id ?? raw.id ?? ''),
    amount: raw.amount_cents ?? order?.amount_cents ?? 0,
    currency: pickCurrency(raw.currency ?? order?.currency),
    status: mapStatus(raw),
    captured,
    customerId: order?.id != null ? String(order.id) : undefined,
    receiptEmail: billing?.email ?? undefined,
    failureMessage: raw.data?.message ?? undefined,
    gateway: 'paymob',
    metadata: strMap({
      order_id: order?.id,
      merchant_order_id: order?.merchant_order_id,
      integration_id: raw.integration_id,
      source_type: raw.source_data?.type,
      source_sub_type: raw.source_data?.sub_type,
      pan: raw.source_data?.pan,
      txn_response_code: raw.data?.txn_response_code,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    raw,
  }
}
