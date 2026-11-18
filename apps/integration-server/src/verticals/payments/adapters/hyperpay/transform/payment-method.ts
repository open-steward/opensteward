/**
 * Maps a HyperPay (OPPWA) **registration** onto the canonical `PaymentMethod`.
 *
 * HyperPay stores card details as a **registration** — a tokenized instrument
 * created via `POST /v1/registrations` or as a side-effect of a payment request
 * with `createRegistration=true`. The stored token can be retrieved by
 * `GET /v1/secureRegistrations/{registrationId}`.
 *
 * The registration response returns card fields nested under a `card` object
 * (`bin`, `last4Digits`, `holder`, `expiryMonth`, `expiryYear`) plus a top-level
 * `paymentBrand` field (e.g. `VISA`, `MASTER`, `MADA`). There is no customer
 * linkage field in the API response.
 *
 * Docs: https://hyperpay.docs.oppwa.com/reference/parameters
 */
import type { PaymentMethod } from '../../../schema/payment-method'
import {
  strMap,
  toIsoDatetime,
  type HyperpayResult,
} from './shared'

export interface RawHyperpayRegistrationCard {
  bin?: string
  last4Digits?: string
  holder?: string
  expiryMonth?: string
  expiryYear?: string
}

export interface RawHyperpayRegistration {
  id?: string
  paymentBrand?: string
  card?: RawHyperpayRegistrationCard
  result?: HyperpayResult
  timestamp?: string
  [k: string]: unknown
}

/**
 * Normalise a HyperPay `paymentBrand` (e.g. `VISA`, `MASTER`, `MADA`,
 * `APPLEPAY`) to a lower-cased canonical brand string.
 */
function normaliseBrand(v: string | undefined): string | undefined {
  if (!v) return undefined
  const b = v.toLowerCase()
  if (b === 'master') return 'mastercard'
  return b
}

export function transformPaymentMethod(raw: RawHyperpayRegistration): PaymentMethod {
  const id = raw.id ?? ''
  const card = raw.card

  const expMonth = card?.expiryMonth ? parseInt(card.expiryMonth, 10) : undefined
  const expYear = card?.expiryYear ? parseInt(card.expiryYear, 10) : undefined

  const meta: Record<string, unknown> = {
    paymentBrand: raw.paymentBrand,
    bin: card?.bin,
    resultCode: raw.result?.code,
    resultDescription: raw.result?.description,
  }

  return {
    id: String(id),
    externalId: String(id),
    type: 'card',
    brand: normaliseBrand(raw.paymentBrand),
    last4: card?.last4Digits ?? undefined,
    expMonth: Number.isFinite(expMonth) ? expMonth : undefined,
    expYear: Number.isFinite(expYear) ? expYear : undefined,
    holderName: card?.holder ?? undefined,
    gateway: 'hyperpay',
    metadata: strMap(meta),
    createdAt: toIsoDatetime(raw.timestamp),
    raw,
  }
}
