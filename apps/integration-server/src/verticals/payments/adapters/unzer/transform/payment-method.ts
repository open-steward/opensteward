/**
 * Unzer payment type ↔ canonical PaymentMethod.
 *
 * Unzer calls payment instruments "types". Each type is created client-side
 * (by the JS/mobile SDK) and assigned an id like `s-crd-…` (card),
 * `s-ppl-…` (PayPal), `s-sdd-…` (SEPA direct debit), etc. The type prefix
 * encodes the instrument kind.
 *
 * For **card** types, Unzer returns:
 *   GET /v1/types/card/{typeId}
 *     → id, number (masked, e.g. "444433******1111"), brand (e.g. "VISA"),
 *       expiryDate ("MM/YYYY"), cardHolder, cvc ("***"), 3ds (boolean),
 *       cardDetails (type, account, country, issuer), geoLocation
 *
 * For other type families the paths differ (e.g. /v1/types/paypal/{id}) but the
 * response does not expose last4 / brand / expiry. `transformPaymentMethod`
 * therefore handles both shapes: card-specific fields are populated when
 * present; other instruments fall back to the generic `other` type.
 *
 * Docs: https://docs.unzer.com/payment-methods/card/accept-card-server-side-only-integration/
 */
import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'
import { toIsoDatetime } from '@opensteward/shared'
import { strMap } from './shared'

export interface RawUnzerCardDetails {
  type?: string
  account?: string
  countryIsoA2?: string
  issuerName?: string
  issuerUrl?: string
  issuerPhoneNumber?: string
}

export interface RawUnzerPaymentType {
  id?: string
  /** Card-type specific fields */
  number?: string
  brand?: string
  expiryDate?: string
  cardHolder?: string
  cvc?: string
  /** Generic fields present on many types */
  recurring?: boolean
  /** ISO timestamp for when the type was created (not always returned) */
  createDate?: string
  cardDetails?: RawUnzerCardDetails
  [k: string]: unknown
}

/**
 * Derive a canonical type from the Unzer type id prefix.
 * Unzer type ids: s-crd-… (card), s-ppl-… (PayPal), s-sdd-… (SEPA DD),
 * s-aps-… (Apple Pay), s-gop-… (Google Pay), s-wlt-… / s-ali-…, etc.
 */
function mapType(id: string | undefined, raw: RawUnzerPaymentType): PaymentMethodType {
  const prefix = (id ?? '').split('-')[1] ?? ''
  switch (prefix) {
    case 'crd':
    case 'dcrd':
      return 'card'
    case 'sdd':
    case 'idd':
      return 'bank_account'
    case 'aps':
    case 'gop':
      return 'wallet'
    default:
      // If brand or card number present, treat as card even without a crd- prefix.
      if (raw.brand || raw.number) return 'card'
      return 'other'
  }
}

/** Parse "MM/YYYY" → { month, year } integers. */
function parseExpiry(expiryDate: string | undefined): { expMonth?: number; expYear?: number } {
  if (!expiryDate) return {}
  const [mm, yyyy] = expiryDate.split('/')
  const expMonth = mm ? parseInt(mm, 10) : undefined
  const expYear = yyyy ? parseInt(yyyy, 10) : undefined
  return {
    expMonth: expMonth && Number.isFinite(expMonth) ? expMonth : undefined,
    expYear: expYear && Number.isFinite(expYear) ? expYear : undefined,
  }
}

/** Extract last-4 from a masked PAN like "444433******1111". */
function extractLast4(number: string | undefined): string | undefined {
  if (!number) return undefined
  const digits = number.replace(/\D/g, '')
  return digits.length >= 4 ? digits.slice(-4) : undefined
}

export function transformPaymentMethod(raw: RawUnzerPaymentType): PaymentMethod {
  const { expMonth, expYear } = parseExpiry(raw.expiryDate)
  const type = mapType(raw.id, raw)
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    type,
    brand: raw.brand?.toLowerCase() || undefined,
    last4: extractLast4(raw.number),
    expMonth,
    expYear,
    holderName: raw.cardHolder || undefined,
    gateway: 'unzer',
    metadata: strMap({
      accountType: raw.cardDetails?.type,
      issuerName: raw.cardDetails?.issuerName,
      countryIsoA2: raw.cardDetails?.countryIsoA2,
    }),
    createdAt: toIsoDatetime(raw.createDate),
    raw,
  }
}
