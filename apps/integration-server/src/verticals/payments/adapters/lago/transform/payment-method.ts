/**
 * Lago PaymentMethod ↔ canonical PaymentMethod.
 *
 * Lago stores payment methods on a customer via an external payment provider
 * (Stripe, Adyen, GoCardless, Cashfree, Flutterwave, Moneyhash). The object
 * exposes the provider's own method identifier (`provider_method_id`) and
 * metadata about the provider type; Lago does not decode card brand/last4 itself
 * — those details live in the provider. We map `lago_id` as the canonical id,
 * `payment_provider_type` as `type`, and `provider_method_id` as `externalId`.
 *
 * List endpoint:   GET /customers/{external_customer_id}/payment_methods
 * Single endpoint: no dedicated GET-by-id; use list and filter by lago_id.
 *
 * Docs: https://docs.getlago.com/api-reference/payment-methods/payment-method-object
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'

export interface RawLagoPaymentMethod {
  lago_id?: string
  /** Injected from the list-endpoint path parameter when iterating over a customer's methods. */
  external_customer_id?: string | null
  is_default?: boolean
  payment_provider_code?: string | null
  payment_provider_name?: string | null
  payment_provider_type?: string | null
  provider_method_id?: string | null
  created_at?: string
  [k: string]: unknown
}

function mapType(raw: RawLagoPaymentMethod): PaymentMethodType {
  const pt = (raw.payment_provider_type ?? '').toLowerCase()
  // GoCardless handles direct debit (ACH/SEPA/BACS); treat as bank_account.
  if (pt === 'gocardless') return 'bank_account'
  // Stripe, Adyen, Cashfree, Flutterwave, Moneyhash typically process cards.
  // We default to 'other' because Lago does not expose the underlying method type.
  return 'other'
}

export function transformPaymentMethod(raw: RawLagoPaymentMethod): PaymentMethod {
  const id = String(raw.lago_id ?? '')
  return {
    id,
    externalId: raw.provider_method_id ?? id,
    customerId: raw.external_customer_id ?? undefined,
    type: mapType(raw),
    isDefault: raw.is_default ?? undefined,
    bankName: raw.payment_provider_name ?? undefined,
    gateway: 'lago',
    metadata: {
      ...(raw.payment_provider_type ? { payment_provider_type: raw.payment_provider_type } : {}),
      ...(raw.payment_provider_code ? { payment_provider_code: raw.payment_provider_code } : {}),
    },
    createdAt: toIsoDatetime(raw.created_at),
    raw,
  }
}
