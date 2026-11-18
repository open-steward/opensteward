/**
 * Primer PaymentMethod → canonical PaymentMethod.
 *
 * Primer exposes saved/vaulted payment methods via `GET /payment-instruments`
 * (filtered by `customer_id`). Each entry is identified by its `token`, which
 * serves as both the Primer-side identifier and the canonical `id`. A separate
 * `analyticsId` is also available as a secondary reference.
 *
 * Money: no money fields — this is a vault record.
 * Timestamps: `createdAt` is ISO-8601 UTC; no `updatedAt` on the wire.
 *
 * Refs:
 *   https://primer.io/docs/api-reference/v2.4/api-reference/payment-methods-api/list-saved-payment-methods
 *   https://primer.io/docs/payment-services/save-payment-methods
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'
import { strMap } from './shared'

/** Card-specific data nested inside a payment instrument. */
export interface RawPrimerPaymentMethodCardData {
  last4Digits?: string
  expirationMonth?: string | number
  expirationYear?: string | number
  cardholderName?: string
  network?: string
  first6Digits?: string
  isNetworkTokenized?: boolean
  [k: string]: unknown
}

/** PayPal-specific data nested inside a payment instrument. */
export interface RawPrimerPaymentMethodPaypalData {
  paypalBillingAgreementId?: string
  externalPayerInfo?: { email?: string; firstName?: string; lastName?: string; [k: string]: unknown }
  [k: string]: unknown
}

/**
 * Raw response object from `GET /payment-instruments`.
 * `paymentMethodData` is a discriminated union keyed on `paymentMethodType`.
 */
export interface RawPrimerPaymentInstrument {
  token?: string
  tokenType?: string
  customerId?: string
  paymentMethodType?: string
  analyticsId?: string
  default?: boolean
  description?: string
  createdAt?: string
  deletedAt?: string
  deleted?: boolean
  /** PAYMENT_CARD data */
  paymentMethodData?: RawPrimerPaymentMethodCardData & RawPrimerPaymentMethodPaypalData & Record<string, unknown>
  [k: string]: unknown
}

/** Map Primer's `paymentMethodType` enum onto the canonical closed set. */
function mapType(raw: string | undefined): PaymentMethodType {
  const t = (raw ?? '').toUpperCase()
  if (t === 'PAYMENT_CARD') return 'card'
  if (t === 'PAYPAL' || t === 'APPLE_PAY' || t === 'GOOGLE_PAY' || t === 'SAMSUNG_PAY') return 'wallet'
  if (t === 'KLARNA' || t === 'CLEARPAY' || t === 'AFTERPAY' || t === 'AFFIRM') return 'bnpl'
  if (t === 'GOCARDLESS' || t === 'ACH' || t === 'BACS' || t === 'SEPA') return 'bank_account'
  return 'other'
}

export function transformPaymentMethod(raw: RawPrimerPaymentInstrument): PaymentMethod {
  const id = String(raw.token ?? raw.analyticsId ?? '')
  const data = raw.paymentMethodData ?? {}
  const expMonth = data.expirationMonth !== undefined ? Number(data.expirationMonth) : undefined
  const expYear = data.expirationYear !== undefined ? Number(data.expirationYear) : undefined

  return {
    id,
    externalId: id,
    customerId: raw.customerId ?? undefined,
    type: mapType(raw.paymentMethodType),
    brand: typeof data.network === 'string' ? data.network.toLowerCase() : undefined,
    last4: data.last4Digits ?? undefined,
    expMonth: !Number.isNaN(expMonth ?? NaN) ? expMonth : undefined,
    expYear: !Number.isNaN(expYear ?? NaN) ? expYear : undefined,
    holderName: data.cardholderName ?? undefined,
    isDefault: raw.default ?? undefined,
    fingerprint: raw.analyticsId ?? undefined,
    gateway: 'primer',
    metadata: strMap({ description: raw.description }),
    createdAt: toIsoDatetime(raw.createdAt),
    raw,
  }
}
