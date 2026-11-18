import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'
import { strMap } from './shared'

/**
 * Pin Payments Card object (GET /customers/{token}/cards).
 * Pin represents stored payment methods as "cards" on a customer.
 */
export interface RawPinCard {
  [k: string]: unknown
}

function mapType(scheme: string | undefined | null): PaymentMethodType {
  const s = typeof scheme === 'string' ? scheme.toLowerCase() : ''
  if (s === 'visa' || s === 'master' || s === 'mastercard' || s === 'amex' || s === 'american express' || s === 'discover') return 'card'
  if (s === 'bank_account' || s === 'eft') return 'bank_account'
  return 'card'
}

export function transformPaymentMethod(raw: RawPinCard): PaymentMethod {
  return {
    id: String(raw['token'] ?? ''),
    externalId: String(raw['token'] ?? ''),
    customerId: raw['customer_token'] != null ? String(raw['customer_token']) : undefined,
    type: mapType(raw['scheme'] as string | undefined),
    brand: raw['scheme'] != null ? String(raw['scheme']) : undefined,
    last4: raw['display_number'] != null
      ? String(raw['display_number']).replace(/\D/g, '').slice(-4) || undefined
      : undefined,
    expMonth: raw['expiry_month'] != null ? Number(raw['expiry_month']) || undefined : undefined,
    expYear: raw['expiry_year'] != null ? Number(raw['expiry_year']) || undefined : undefined,
    holderName: raw['name'] != null ? String(raw['name']) : undefined,
    isDefault: raw['primary'] != null ? Boolean(raw['primary']) : undefined,
    gateway: 'pin-payments',
    metadata: strMap(raw['metadata'] ?? {}),
    createdAt: raw['created_at'] != null ? String(raw['created_at']) : undefined,
    raw,
  }
}
