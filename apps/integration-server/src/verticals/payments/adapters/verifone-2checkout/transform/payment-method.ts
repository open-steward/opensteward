/**
 * 2Checkout ExistingCard ↔ canonical PaymentMethod.
 *
 * 2Checkout does not expose a dedicated REST endpoint for saved payment
 * methods. Instead, stored card data is accessible on the customer object
 * when requested with the `IncludePaymentData=true` query parameter. The
 * `ExistingCards` array on the customer response contains one entry per
 * stored card.
 *
 * Source: GET /customers/{AvangateCustomerReference}/?IncludePaymentData=true
 * Response field: ExistingCards[].{ CardType, LastDigits, ExpirationMonth,
 *   ExpirationYear, NameOnCard }
 *
 * Docs: https://docs.2checkout.com/api-reference (customer object schema)
 */
import type { PaymentMethod } from '../../../schema/payment-method'
import { pickStr, strMap } from './shared'

export interface RawVerifone2checkoutExistingCard {
  /** 2Checkout-internal token or reference for the stored card. */
  Token?: string | null
  CardType?: string | null
  LastDigits?: string | null
  ExpirationMonth?: string | number | null
  ExpirationYear?: string | number | null
  NameOnCard?: string | null
  [k: string]: unknown
}

function mapBrand(raw: RawVerifone2checkoutExistingCard): string | undefined {
  return pickStr(raw.CardType)?.toLowerCase()
}

export function transformPaymentMethod(
  raw: RawVerifone2checkoutExistingCard,
  customerId: string,
): PaymentMethod {
  // Use Token as id when present; fall back to a deterministic composite.
  const token = pickStr(raw.Token)
  const last4 = pickStr(raw.LastDigits)
  const brand = mapBrand(raw)
  const id = token ?? [customerId, brand, last4].filter(Boolean).join('_')

  const expMonth = raw.ExpirationMonth !== undefined && raw.ExpirationMonth !== null
    ? Number(raw.ExpirationMonth)
    : undefined
  const expYear = raw.ExpirationYear !== undefined && raw.ExpirationYear !== null
    ? Number(raw.ExpirationYear)
    : undefined

  return {
    id,
    externalId: id,
    customerId: customerId || undefined,
    type: 'card',
    brand,
    last4,
    expMonth: Number.isFinite(expMonth) ? expMonth : undefined,
    expYear: Number.isFinite(expYear) ? expYear : undefined,
    holderName: pickStr(raw.NameOnCard),
    gateway: 'verifone-2checkout',
    metadata: strMap({ cardType: raw.CardType }),
    raw,
  }
}
