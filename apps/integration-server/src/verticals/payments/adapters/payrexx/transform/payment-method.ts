// Payrexx PaymentMethod endpoint: GET /v1.14/PaymentMethod/
// Returns the merchant's active/configured payment providers (name, label, logo,
// options_by_psp). These are gateway-level payment method types, not per-customer
// stored credentials. Fields confirmed from PHP SDK response model.
import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'
import { strMap } from './shared'

export interface RawPayrexxPaymentMethod {
  [k: string]: unknown
}

function mapType(name: string | undefined | null): PaymentMethodType {
  const v = typeof name === 'string' ? name.toLowerCase() : ''
  if (v.includes('card') || v.includes('visa') || v.includes('master') || v.includes('amex')) return 'card'
  if (v.includes('bank') || v.includes('transfer') || v.includes('iban') || v.includes('sepa') || v.includes('twint')) return 'bank_account'
  if (v.includes('apple') || v.includes('google') || v.includes('paypal') || v.includes('wallet')) return 'wallet'
  if (v.includes('klarna') || v.includes('afterpay') || v.includes('bnpl') || v.includes('invoice')) return 'bnpl'
  return 'other'
}

export function transformPaymentMethod(raw: RawPayrexxPaymentMethod): PaymentMethod {
  const name = raw['name'] != null ? String(raw['name']) : ''
  const labelObj = raw['label'] as Record<string, unknown> | undefined
  const displayName =
    labelObj?.['en'] != null
      ? String(labelObj['en'])
      : labelObj?.['de'] != null
        ? String(labelObj['de'])
        : name

  return {
    id: name,
    externalId: name,
    type: mapType(name),
    brand: displayName || undefined,
    gateway: 'payrexx',
    metadata: strMap(raw['metadata'] ?? {}),
    raw,
  }
}
