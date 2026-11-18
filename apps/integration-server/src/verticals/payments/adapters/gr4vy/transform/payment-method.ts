import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'
import { toIsoDatetime } from '@opensteward/shared'
import { pickStr, strMap } from './shared'

/**
 * A Gr4vy *payment-method* maps to a canonical PaymentMethod. `method` carries
 * the instrument kind (card, paypal, …); for cards `scheme` is the brand and
 * `label` holds the last four digits. `expiration_date` is `MM/YY`.
 *
 * Docs: https://docs.gr4vy.com/reference/payment-methods/get-payment-method
 */
export interface RawGr4vyPaymentMethod {
  id?: string
  method?: string
  label?: string | null
  scheme?: string | null
  expiration_date?: string | null
  fingerprint?: string | null
  currency?: string | null
  country?: string | null
  buyer?: { id?: string } | null
  details?: { card_type?: string; issuer_name?: string; bin?: string } | null
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

const CARD_METHODS = new Set(['card', 'click-to-pay', 'network-token', 'card-token'])
const WALLET_METHODS = new Set(['applepay', 'googlepay', 'paypal', 'click', 'venmo', 'gocardless'])
const BNPL_METHODS = new Set([
  'afterpay',
  'clearpay',
  'klarna',
  'affirm',
  'zip',
  'scalapay',
  'sezzle',
])
const BANK_METHODS = new Set(['banked', 'bankaccount', 'sepa', 'ach', 'trustly', 'ideal', 'sofort'])

function mapType(method: string | undefined): PaymentMethodType {
  const m = (method ?? '').toLowerCase()
  if (CARD_METHODS.has(m)) return 'card'
  if (WALLET_METHODS.has(m)) return 'wallet'
  if (BNPL_METHODS.has(m)) return 'bnpl'
  if (BANK_METHODS.has(m)) return 'bank_account'
  return 'other'
}

/** Split a Gr4vy `MM/YY` expiry into numeric month + 4-digit year. */
function splitExpiry(raw: string | null | undefined): { month?: number; year?: number } {
  if (!raw) return {}
  const match = /^(\d{1,2})\/(\d{2}|\d{4})$/.exec(raw.trim())
  if (!match) return {}
  const month = Number(match[1])
  const yearPart = match[2]
  const year = yearPart.length === 2 ? 2000 + Number(yearPart) : Number(yearPart)
  return {
    month: month >= 1 && month <= 12 ? month : undefined,
    year: Number.isNaN(year) ? undefined : year,
  }
}

export function transformPaymentMethod(raw: RawGr4vyPaymentMethod): PaymentMethod {
  const { month, year } = splitExpiry(raw.expiration_date)
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    customerId: pickStr(raw.buyer?.id),
    type: mapType(raw.method),
    brand: pickStr(raw.scheme) ?? pickStr(raw.method),
    last4: pickStr(raw.label),
    expMonth: month,
    expYear: year,
    bankName: pickStr(raw.details?.issuer_name),
    fingerprint: pickStr(raw.fingerprint),
    gateway: 'gr4vy',
    metadata: strMap({
      method: raw.method,
      currency: raw.currency,
      country: raw.country,
      card_type: raw.details?.card_type,
      bin: raw.details?.bin,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
