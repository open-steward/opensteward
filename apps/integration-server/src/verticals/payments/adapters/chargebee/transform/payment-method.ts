/**
 * Chargebee PaymentSource → canonical PaymentMethod.
 *
 * Chargebee models payment methods as `payment_source` objects. Each source
 * belongs to a customer and carries card details or bank account info.
 *
 * Field mapping:
 *   id                       → id / externalId
 *   customer_id              → customerId
 *   type                     → type (card / bank_account / wallet etc.)
 *   card.brand               → brand
 *   card.last4               → last4
 *   card.expiry_month        → expMonth
 *   card.expiry_year         → expYear
 *   card.name_on_card        → holderName
 *   bank_account.name_on_account → holderName
 *   bank_account.bank_name   → bankName
 *   status=VALID (first src) → isDefault (if primary_payment_source_id matches)
 *   created_at               → createdAt
 *   updated_at               → updatedAt
 *
 * Docs: https://apidocs.chargebee.com/docs/api/payment_sources
 */

import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'
import { strMap, toIso } from './shared'

// ── Raw shapes ────────────────────────────────────────────────────────────────

export interface RawChargebeeCard {
  brand?: string | null
  last4?: string | null
  expiry_month?: number | null
  expiry_year?: number | null
  name_on_card?: string | null
  masked_number?: string | null
  [k: string]: unknown
}

export interface RawChargebeeBankAccount {
  name_on_account?: string | null
  bank_name?: string | null
  last4?: string | null
  [k: string]: unknown
}

export interface RawChargebeePaymentSource {
  id?: string
  customer_id?: string
  type?: string | null
  status?: string | null
  card?: RawChargebeeCard | null
  bank_account?: RawChargebeeBankAccount | null
  deleted?: boolean
  is_primary?: boolean
  created_at?: number
  updated_at?: number
  [k: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_MAP: Record<string, PaymentMethodType> = {
  card: 'card',
  ideal: 'a2a',
  sepa_debit: 'bank_account',
  bancontact: 'a2a',
  paypal_express_checkout: 'wallet',
  amazon_payments: 'wallet',
  apple_pay: 'wallet',
  google_pay: 'wallet',
  sofort: 'bank_account',
  bank_transfer: 'bank_account',
  boleto: 'bank_account',
  direct_debit: 'bank_account',
  generic: 'other',
}

function resolveType(raw: RawChargebeePaymentSource): PaymentMethodType {
  const t = (raw.type ?? '').toLowerCase()
  return TYPE_MAP[t] ?? 'other'
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformPaymentMethod(raw: RawChargebeePaymentSource): PaymentMethod {
  const card = raw.card
  const bank = raw.bank_account
  const type = resolveType(raw)

  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    customerId: raw.customer_id ?? undefined,
    type,
    brand: card?.brand ?? undefined,
    last4: card?.last4 ?? bank?.last4 ?? undefined,
    expMonth: card?.expiry_month ?? undefined,
    expYear: card?.expiry_year ?? undefined,
    holderName: card?.name_on_card ?? bank?.name_on_account ?? undefined,
    bankName: bank?.bank_name ?? undefined,
    isDefault: raw.is_primary ?? undefined,
    gateway: 'chargebee',
    metadata: strMap({}),
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    raw,
  }
}
