/**
 * Finix `Payment Instrument` ↔ canonical `PaymentMethod`.
 *
 * `type` / `instrument_type` is PAYMENT_CARD, BANK_ACCOUNT or TOKEN. Cards
 * expose brand / last_four / expiration_month / expiration_year; bank
 * accounts expose bank_code / masked_account_number / account_type. Each
 * instrument belongs to a single Identity (`identity`).
 */
import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'
import { iso, refId, strMap } from './shared'

export interface RawFinixPaymentInstrument {
  id?: string
  type?: string
  instrument_type?: string
  brand?: string | null
  last_four?: string | null
  expiration_month?: number | null
  expiration_year?: number | null
  name?: string | null
  fingerprint?: string | null
  identity?: string | null
  bank_code?: string | null
  masked_account_number?: string | null
  account_type?: string | null
  card_type?: string | null
  bin?: string | null
  enabled?: boolean
  tags?: Record<string, unknown> | null
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

function mapType(raw: RawFinixPaymentInstrument): PaymentMethodType {
  switch ((raw.instrument_type ?? raw.type ?? '').toUpperCase()) {
    case 'PAYMENT_CARD':
      return 'card'
    case 'BANK_ACCOUNT':
      return 'bank_account'
    case 'TOKEN':
      return 'other'
    default:
      return 'other'
  }
}

export function transformPaymentMethod(raw: RawFinixPaymentInstrument): PaymentMethod {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    customerId: refId(raw.identity),
    type: mapType(raw),
    brand: raw.brand ? raw.brand.toLowerCase() : undefined,
    last4: raw.last_four ?? undefined,
    expMonth: raw.expiration_month ?? undefined,
    expYear: raw.expiration_year ?? undefined,
    holderName: raw.name ?? undefined,
    bankName: raw.bank_code ?? undefined,
    fingerprint: raw.fingerprint ?? undefined,
    gateway: 'finix',
    metadata: strMap({
      ...(raw.tags ?? {}),
      card_type: raw.card_type,
      account_type: raw.account_type,
      masked_account_number: raw.masked_account_number,
      bin: raw.bin,
    }),
    createdAt: iso(raw.created_at),
    updatedAt: iso(raw.updated_at),
    raw,
  }
}
