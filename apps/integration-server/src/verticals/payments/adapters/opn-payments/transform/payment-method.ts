/**
 * Opn Payments (Omise) PaymentMethod transform.
 *
 * Opn Payments models payment instruments as "Sources" and attached
 * "Cards" under a customer. This transform handles card-type sources
 * returned by GET /customers/{id}/cards.
 *
 * Docs: https://docs.opn.ooo/sources-api
 */

import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'
import { pickCurrency, strMap } from './shared'

export interface RawOpnCard {
  [k: string]: unknown
}

function mapType(s: string | undefined): PaymentMethodType {
  const v = (s ?? '').toLowerCase()
  if (v === 'card' || v.includes('credit') || v.includes('debit')) return 'card'
  if (v.includes('bank') || v.includes('account')) return 'bank_account'
  if (v.includes('wallet') || v === 'truemoney' || v === 'rabbit_linepay' || v === 'wechat_pay') return 'wallet'
  if (v === 'installment' || v === 'bnpl') return 'bnpl'
  return 'other'
}

export function transformPaymentMethod(raw: RawOpnCard, customerId?: string): PaymentMethod {
  const id = String(raw['id'] ?? '')
  const brand = raw['brand'] as string | undefined
  const last4 = raw['last_digits'] as string | undefined
  const expMonth = typeof raw['expiration_month'] === 'number' ? raw['expiration_month'] : undefined
  const expYear = typeof raw['expiration_year'] === 'number' ? raw['expiration_year'] : undefined
  const holderName = raw['name'] as string | undefined
  const fingerprint = raw['fingerprint'] as string | undefined
  const createdAt = raw['created'] != null ? String(raw['created']) : undefined

  return {
    id,
    externalId: id,
    customerId: customerId ?? (raw['customer'] as string | undefined),
    type: mapType(raw['object'] as string | undefined),
    brand: brand ?? undefined,
    last4: last4 ?? undefined,
    expMonth,
    expYear,
    holderName: holderName ?? undefined,
    fingerprint: fingerprint ?? undefined,
    gateway: 'opn-payments',
    metadata: strMap({
      bank: raw['bank'],
      country: raw['country'],
      currency: pickCurrency(raw['currency'] as string | undefined, 'THB'),
    }),
    createdAt,
    raw,
  }
}
