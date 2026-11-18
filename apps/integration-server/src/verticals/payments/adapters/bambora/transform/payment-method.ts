import type { PaymentMethod } from '../../../schema/payment-method'
import { toIsoDatetime } from '@opensteward/shared'
import { strMap } from './shared'

/**
 * A Bambora card record returned by `GET /v1/profiles/{id}/cards` or
 * `GET /v1/profiles/{id}/cards/{card_id}`.
 *
 * Field names follow the Bambora NA Payment Profiles API as reflected in the
 * official Java SDK domain object (bambora-na/beanstream-java Card):
 *   - `card_id`       numeric position (1-indexed) or identifier of the card
 *   - `name`          cardholder name
 *   - `number`        masked card number (e.g. "XXXX XXXX XXXX 1234")
 *   - `expiry_month`  2-digit month ("01" – "12")
 *   - `expiry_year`   2-digit year ("28")
 *   - `card_type`     card brand code (e.g. "VI", "MC", "AX", "DI")
 *   - `function`      "DEF" (default) | "SEC" (secondary)
 */
export interface RawBamboraCard {
  card_id?: number | string
  name?: string
  number?: string
  expiry_month?: string | number
  expiry_year?: string | number
  card_type?: string
  function?: string
  [k: string]: unknown
}

/** Brand abbreviation → human-readable name used by the canonical schema. */
function mapBrand(code: string | undefined): string | undefined {
  if (!code) return undefined
  switch (code.toUpperCase()) {
    case 'VI': return 'visa'
    case 'MC': return 'mastercard'
    case 'AX': return 'amex'
    case 'DI': return 'discover'
    case 'JC': return 'jcb'
    case 'NO': return 'novus'
    default: return code.toLowerCase()
  }
}

export function transformPaymentMethod(
  raw: RawBamboraCard,
  profileId?: string,
): PaymentMethod {
  const id = String(raw.card_id ?? '')
  // The masked number from Bambora looks like "XXXX XXXX XXXX 1234"; last 4 are the real digits.
  const last4 = raw.number ? raw.number.replace(/\s/g, '').slice(-4) : undefined

  const expMonth =
    raw.expiry_month != null ? Number(raw.expiry_month) : undefined
  const expYear =
    raw.expiry_year != null
      ? Number(raw.expiry_year) + (Number(raw.expiry_year) < 100 ? 2000 : 0)
      : undefined

  return {
    id,
    externalId: id,
    customerId: profileId,
    type: 'card',
    brand: mapBrand(raw.card_type),
    last4: last4 && last4.length === 4 ? last4 : undefined,
    expMonth,
    expYear,
    holderName: raw.name || undefined,
    isDefault: (raw.function ?? '').toUpperCase() === 'DEF',
    gateway: 'bambora',
    metadata: strMap({
      card_type: raw.card_type,
      function: raw.function,
    }),
    createdAt: toIsoDatetime(undefined),
    updatedAt: toIsoDatetime(undefined),
    raw,
  }
}
