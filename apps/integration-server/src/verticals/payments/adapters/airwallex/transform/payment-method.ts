/**
 * Airwallex payment method → canonical PaymentMethod.
 *
 * Airwallex stores vaulted payment methods under
 * `GET /api/v1/pa/payment_methods` (list) and
 * `GET /api/v1/pa/payment_methods/{id}` (single).
 * Each method has a `type` (card, wechatpay, alipaycn, …), a `billing` block
 * and a nested card descriptor when type === 'card'.
 *
 * Refs:
 *   https://www.airwallex.com/docs/api/payments/payment_methods
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'
import { strMap } from './shared'

export interface RawAirwallexCard {
  number_type?: string     // PAN, LAST4, TOKEN
  last_four?: string
  expiry_month?: string    // "01"–"12"
  expiry_year?: string     // "2028"
  name?: string
  brand?: string           // visa, mastercard, amex, unionpay, …
  fingerprint?: string
  [k: string]: unknown
}

export interface RawAirwallexPaymentMethod {
  id?: string
  type?: string            // card, wechatpay, alipaycn, alipayhk, googlepay, applepay, …
  customer_id?: string
  card?: RawAirwallexCard
  billing?: {
    first_name?: string
    last_name?: string
    email?: string
    [k: string]: unknown
  }
  status?: string          // ACTIVE, INACTIVE
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

function mapType(raw: RawAirwallexPaymentMethod): PaymentMethodType {
  const t = (raw.type ?? '').toLowerCase()
  if (t === 'card') return 'card'
  if (t === 'wechatpay' || t === 'alipaycn' || t === 'alipayhk') return 'wallet'
  if (t === 'googlepay' || t === 'applepay') return 'wallet'
  if (t === 'directdebit' || t === 'banktransfer' || t === 'sepa_debit') return 'bank_account'
  return 'other'
}

export function transformPaymentMethod(raw: RawAirwallexPaymentMethod): PaymentMethod {
  const card = raw.card
  const billing = raw.billing
  const holderName = card?.name
    ?? (billing ? [billing.first_name, billing.last_name].filter(Boolean).join(' ').trim() : undefined)

  let expMonth: number | undefined
  let expYear: number | undefined
  if (card?.expiry_month) {
    const m = parseInt(card.expiry_month, 10)
    if (!Number.isNaN(m)) expMonth = m
  }
  if (card?.expiry_year) {
    const y = parseInt(card.expiry_year, 10)
    if (!Number.isNaN(y)) expYear = y
  }

  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    customerId: raw.customer_id ?? undefined,
    type: mapType(raw),
    brand: card?.brand ?? raw.type ?? undefined,
    last4: card?.last_four ?? undefined,
    expMonth,
    expYear,
    holderName: holderName || undefined,
    fingerprint: card?.fingerprint ?? undefined,
    gateway: 'airwallex',
    metadata: strMap({ status: raw.status, type: raw.type }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
