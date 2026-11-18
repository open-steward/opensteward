/**
 * Iugu PaymentMethod -> canonical PaymentMethod.
 *
 * Iugu calls payment methods "payment_methods" on the customer resource.
 * They can be cards (credit/debit) or bank accounts.
 * Reference: https://dev.iugu.com
 */
import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'
import { strMap } from './shared'

export interface RawIuguPaymentMethod {
  [k: string]: unknown
}

function mapType(raw: RawIuguPaymentMethod): PaymentMethodType {
  const t = typeof raw['method_type'] === 'string' ? raw['method_type'].toLowerCase() : ''
  if (t === 'credit_card' || t === 'card') return 'card'
  if (t === 'debit_card') return 'card'
  if (t === 'bank_account' || t === 'bank_slip' || t === 'boleto') return 'bank_account'
  if (t === 'pix') return 'a2a'
  return 'other'
}

export function transformPaymentMethod(raw: RawIuguPaymentMethod): PaymentMethod {
  const data = (raw['data'] as Record<string, unknown> | undefined) ?? {}
  const last4 = data['last_digits'] != null ? String(data['last_digits']) : undefined
  const brand = data['brand'] != null ? String(data['brand']).toLowerCase() : undefined
  const holderName = data['holder_name'] != null ? String(data['holder_name']) : undefined
  const expMonth =
    data['month'] != null ? parseInt(String(data['month']), 10) || undefined : undefined
  const expYear =
    data['year'] != null ? parseInt(String(data['year']), 10) || undefined : undefined

  return {
    id: String(raw['id'] ?? ''),
    externalId: String(raw['id'] ?? ''),
    customerId: raw['customer_id'] != null ? String(raw['customer_id']) : undefined,
    type: mapType(raw),
    brand,
    last4,
    expMonth,
    expYear,
    holderName,
    isDefault: raw['set_as_default'] === true || raw['default'] === true,
    gateway: 'iugu',
    metadata: strMap(raw['metadata'] ?? raw['extra'] ?? {}),
    createdAt: raw['created_at'] != null ? String(raw['created_at']) : undefined,
    raw,
  }
}
