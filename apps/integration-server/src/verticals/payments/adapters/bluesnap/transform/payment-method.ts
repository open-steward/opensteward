import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'
import { strMap } from './shared'
import type { RawBluesnapVaultedShopper } from './customer'

/**
 * BlueSnap stores payment methods within vaulted shoppers as
 * `paymentSources.creditCardInfo[]`. Each entry carries the last four digits,
 * card type, and expiry. There is no dedicated payment-method endpoint; the
 * resource is derived from `GET /services/2/vaulted-shoppers/{id}`.
 *
 * Docs: https://developers.bluesnap.com/v8976-JSON/reference/payment-sources
 */
export interface RawBluesnapCreditCardInfo {
  cardLastFourDigits?: string | number
  cardType?: string
  expirationMonth?: number | string
  expirationYear?: number | string
  binNumber?: string | number
  isDefault?: boolean
  [k: string]: unknown
}

export interface RawBluesnapPaymentSources {
  creditCardInfo?: RawBluesnapCreditCardInfo[]
  [k: string]: unknown
}

function mapCardType(cardType: string | undefined): string | undefined {
  if (!cardType) return undefined
  const t = cardType.toLowerCase()
  // BlueSnap card type strings: VISA, MASTERCARD, AMEX, DISCOVER, etc.
  return t
}

function mapType(_info: RawBluesnapCreditCardInfo): PaymentMethodType {
  // All payment sources in BlueSnap vaulted shoppers are credit/debit cards.
  return 'card'
}

export function transformPaymentMethod(
  info: RawBluesnapCreditCardInfo,
  shopperId: string | number | undefined,
  index: number,
): PaymentMethod {
  // Unused: `brand` below calls mapCardType(info.cardType) directly, and
  // mapCardType lowercases its input, so this uppercased copy is redundant.
  const _cardType = info.cardType?.toUpperCase() ?? ''
  // BlueSnap has no standalone payment method ID; synthesise one from shopper + index.
  const id = shopperId != null ? `${shopperId}-card-${index}` : `card-${index}`
  return {
    id,
    externalId: id,
    customerId: shopperId != null ? String(shopperId) : undefined,
    type: mapType(info),
    brand: mapCardType(info.cardType),
    last4: info.cardLastFourDigits != null ? String(info.cardLastFourDigits).slice(-4) : undefined,
    expMonth:
      info.expirationMonth != null ? Number(info.expirationMonth) || undefined : undefined,
    expYear:
      info.expirationYear != null ? Number(info.expirationYear) || undefined : undefined,
    isDefault: info.isDefault ?? index === 0,
    gateway: 'bluesnap',
    metadata: strMap({ binNumber: info.binNumber }),
    raw: info,
  }
}

/**
 * Extract all payment methods from a vaulted shopper response.
 */
export function transformPaymentMethodsFromShopper(
  shopper: RawBluesnapVaultedShopper,
): PaymentMethod[] {
  const sources = (shopper as unknown as { paymentSources?: RawBluesnapPaymentSources })
    .paymentSources
  const cards = sources?.creditCardInfo ?? []
  return cards.map((info, i) => transformPaymentMethod(info, shopper.vaultedShopperId, i))
}
