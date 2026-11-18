/**
 * Xendit Payment Method (v2) → canonical PaymentMethod.
 *
 *   GET https://api.xendit.co/v2/payment_methods       — List Payment Methods
 *   GET https://api.xendit.co/v2/payment_methods/:id   — Get Payment Method by ID
 *
 * Every field read here is documented on the Payment Method Object, Card
 * Object, Direct Debit Object or E-Wallets Object:
 * https://archive.developers.xendit.co/api-reference/payments-api/#payment-method-object
 *
 * `type` — "Type of payment method ... Possible values: EWALLET DIRECT_DEBIT
 * CARD VIRTUAL_ACCOUNT OVER_THE_COUNTER QR_CODE".
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'
import { strMap } from './shared'

// ── Raw shape (documented fields only) ────────────────────────────────────────

export interface RawXenditCardInformation {
  token_id?: string | null
  /** "Masked card number", e.g. "40000000XXXX1091". */
  masked_card_number?: string | null
  cardholder_name?: string | null
  /** "Card expiry month in MM format." */
  expiry_month?: string | null
  /** "Card expiry year in YYYY format." Typed number; the example is a string. */
  expiry_year?: number | string | null
  type?: string | null
  /** "Card scheme ... VISA MASTERCARD JCB AMEX" */
  network?: string | null
  country?: string | null
  issuer?: string | null
  /** "Unique consistent identifier for the card." Typed number; the example is a string. */
  fingerprint?: string | number | null
  [k: string]: unknown
}

export interface RawXenditPaymentMethod {
  id?: string
  business_id?: string | null
  customer_id?: string | null
  reference_id?: string | null
  reusability?: string | null
  country?: string | null
  status?: string | null
  type?: string | null
  card?: {
    card_information?: RawXenditCardInformation | null
    [k: string]: unknown
  } | null
  ewallet?: {
    channel_code?: string | null
    account?: {
      account_details?: string | null
      /** "Name of the eWallet account holder." */
      name?: string | null
      [k: string]: unknown
    } | null
    [k: string]: unknown
  } | null
  direct_debit?: {
    /** "If direct_debit.type='BANK_ACCOUNT' ..." / "If direct_debit.type='DEBIT_CARD' ..." */
    type?: string | null
    /** "Identifier for the payment channel partner", e.g. BRI, BPI. */
    channel_code?: string | null
    debit_card?: {
      /** "Last four digits of the debit card." */
      card_last_four?: string | null
      [k: string]: unknown
    } | null
    bank_account?: {
      /** "Masked account details as provided by the bank." */
      masked_bank_account_number?: string | null
      /** "Unique hash for the specific account." */
      bank_account_hash?: string | null
    } | null
    [k: string]: unknown
  } | null
  description?: string | null
  failure_code?: string | null
  metadata?: Record<string, unknown> | null
  created?: string | null
  updated?: string | null
  [k: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapType(xenditType: string | null | undefined): PaymentMethodType {
  switch (xenditType) {
    case 'CARD':
      return 'card'
    case 'EWALLET':
      return 'wallet'
    case 'DIRECT_DEBIT':
    case 'VIRTUAL_ACCOUNT':
      return 'bank_account'
    case 'OVER_THE_COUNTER':
    case 'QR_CODE':
      return 'other'
    default:
      return 'unknown'
  }
}

/** Trailing four digits of a masked number ("XXXXXX1234" → "1234"). */
function trailingFour(masked: string | null | undefined): string | undefined {
  const m = /(\d{4})$/.exec(masked ?? '')
  return m ? m[1] : undefined
}

function toMonth(v: string | null | undefined): number | undefined {
  const n = Number(v)
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : undefined
}

function toYear(v: number | string | null | undefined): number | undefined {
  const n = Number(v)
  return v != null && v !== '' && Number.isInteger(n) ? n : undefined
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformPaymentMethod(raw: RawXenditPaymentMethod): PaymentMethod {
  if (!raw.id) throw new Error('Xendit payment method has no id')

  const out: PaymentMethod = {
    id: raw.id,
    externalId: raw.id,
    customerId: raw.customer_id ?? undefined,
    type: mapType(raw.type),
    gateway: 'xendit',
    metadata: strMap({
      ...(raw.metadata ?? {}),
      reference_id: raw.reference_id,
      status: raw.status,
      reusability: raw.reusability,
      country: raw.country,
      business_id: raw.business_id,
      failure_code: raw.failure_code,
    }),
    createdAt: toIsoDatetime(raw.created),
    updatedAt: toIsoDatetime(raw.updated),
    raw,
  }

  const info = raw.card?.card_information
  if (info) {
    out.brand = info.network ? info.network.toLowerCase() : undefined
    out.last4 = trailingFour(info.masked_card_number)
    out.expMonth = toMonth(info.expiry_month)
    out.expYear = toYear(info.expiry_year)
    out.holderName = info.cardholder_name ?? undefined
    out.fingerprint = info.fingerprint != null ? String(info.fingerprint) : undefined
  }

  const ewallet = raw.ewallet
  if (ewallet) {
    out.brand = ewallet.channel_code ? ewallet.channel_code.toLowerCase() : undefined
    out.holderName = ewallet.account?.name ?? undefined
  }

  const dd = raw.direct_debit
  if (dd) {
    out.bankName = dd.channel_code ?? undefined
    if (dd.type === 'DEBIT_CARD') {
      out.last4 = dd.debit_card?.card_last_four ?? undefined
    } else if (dd.type === 'BANK_ACCOUNT') {
      out.last4 = trailingFour(dd.bank_account?.masked_bank_account_number)
      out.fingerprint = dd.bank_account?.bank_account_hash ?? undefined
    }
  }

  return out
}
