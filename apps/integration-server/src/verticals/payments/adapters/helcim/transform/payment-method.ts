/**
 * Helcim stored card ↔ canonical PaymentMethod.
 *
 * Helcim stores card payment methods as customer-scoped objects, accessible
 * via `GET /customers/{customerId}/cards` and
 * `GET /customers/{customerId}/cards/{cardId}`.
 *
 * The card object fields are:
 *   id            — numeric card record id
 *   cardToken     — re-usable token for the Payment API
 *   cardF6L4      — first-6/last-4 of the PAN (e.g. "411111XXXXXX1234")
 *   cardHolderName — name on card
 *   cardExpiry    — MMYY format (e.g. "0125")
 *   dateCreated   — YYYY-MM-DD HH:MM:SS (Mountain Time)
 *   dateUpdated   — YYYY-MM-DD HH:MM:SS (Mountain Time)
 *
 * Helcim does NOT return a cardType / brand in the stored card object (the
 * brand appears in transaction responses as `cardType`, e.g. "MC"). We set
 * the canonical `type` to "card" and leave `brand` undefined.
 *
 * `customerId` must be threaded in by the caller (it is not in the card body).
 *
 * Refs:
 *   https://devdocs.helcim.com/docs/cards
 *   https://devdocs.helcim.com/docs/customer-api
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { PaymentMethod } from '../../../schema/payment-method'
import { strMap } from './shared'

export interface RawHelcimCard {
  id?: number | string
  cardToken?: string
  cardF6L4?: string
  cardHolderName?: string
  /** MMYY e.g. "0125" */
  cardExpiry?: string
  dateCreated?: string
  dateUpdated?: string
  [k: string]: unknown
}

/** Parse a MMYY string into { expMonth, expYear }. Never throws. */
function parseExpiry(mmyy: string | undefined): { expMonth?: number; expYear?: number } {
  if (!mmyy || mmyy.length < 4) return {}
  const mm = parseInt(mmyy.slice(0, 2), 10)
  const yy = parseInt(mmyy.slice(2, 4), 10)
  if (!Number.isFinite(mm) || !Number.isFinite(yy)) return {}
  return { expMonth: mm, expYear: 2000 + yy }
}

/** Extract the last-4 from a cardF6L4 string (e.g. "411111XXXXXX1234" → "1234"). */
function extractLast4(cardF6L4: string | undefined): string | undefined {
  if (!cardF6L4 || cardF6L4.length < 4) return undefined
  return cardF6L4.slice(-4)
}

export function transformPaymentMethod(raw: RawHelcimCard, customerId?: string): PaymentMethod {
  const { expMonth, expYear } = parseExpiry(raw.cardExpiry)
  return {
    id: String(raw.id ?? raw.cardToken ?? ''),
    externalId: String(raw.cardToken ?? raw.id ?? ''),
    customerId: customerId || undefined,
    type: 'card',
    last4: extractLast4(raw.cardF6L4),
    expMonth,
    expYear,
    holderName: raw.cardHolderName || undefined,
    fingerprint: raw.cardToken || undefined,
    gateway: 'helcim',
    metadata: strMap({
      cardToken: raw.cardToken,
      cardF6L4: raw.cardF6L4,
    }),
    createdAt: raw.dateCreated ? toIsoDatetime(raw.dateCreated) : undefined,
    updatedAt: raw.dateUpdated ? toIsoDatetime(raw.dateUpdated) : undefined,
    raw,
  }
}
