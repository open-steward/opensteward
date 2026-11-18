/**
 * Maps a Worldpay Access Tokens API response to the canonical PaymentMethod type.
 *
 * Endpoint: GET https://try.access.worldpay.com/tokens?tokenId={tokenId}
 * The response is a HAL envelope; the token object is in _embedded.tokens[0].
 *
 * Response fields documented at:
 * https://developer.worldpay.com/products/access/tokens/querying-and-updating-tokens
 */

import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'
import { strMap } from './shared'

export interface RawWorldpayTokenCardExpiryDate {
  month?: number
  year?: number
  [k: string]: unknown
}

export interface RawWorldpayTokenPaymentInstrument {
  type?: string
  cardNumber?: string
  cardHolderName?: string
  cardExpiryDate?: RawWorldpayTokenCardExpiryDate
  bin?: string
  brand?: string
  fundingType?: string
  countryCode?: string
  last4Digits?: string
  networkType?: string
  billingAddress?: {
    address1?: string
    postalCode?: string
    city?: string
    state?: string
    countryCode?: string
    [k: string]: unknown
  }
  [k: string]: unknown
}

export interface RawWorldpayToken {
  tokenId?: string
  namespace?: string
  description?: string
  tokenExpiryDateTime?: string
  paymentInstrument?: RawWorldpayTokenPaymentInstrument
  [k: string]: unknown
}

function mapType(brand: string | undefined, fundingType: string | undefined): PaymentMethodType {
  const b = (brand ?? '').toLowerCase()
  const f = (fundingType ?? '').toLowerCase()
  if (b === 'applepay' || b === 'googlepay' || b === 'paywithgoogle') return 'wallet'
  if (f === 'debit' || f === 'credit' || b) return 'card'
  return 'other'
}

function mapBrand(brand: string | undefined): string | undefined {
  if (!brand) return undefined
  return brand.toLowerCase()
}

export function transformPaymentMethod(raw: RawWorldpayToken): PaymentMethod {
  const instr = raw.paymentInstrument ?? {}
  const expiry = instr.cardExpiryDate ?? {}

  return {
    id: String(raw.tokenId ?? ''),
    externalId: String(raw.tokenId ?? ''),
    type: mapType(instr.brand, instr.fundingType),
    brand: mapBrand(instr.brand),
    last4: instr.last4Digits,
    expMonth: expiry.month,
    expYear: expiry.year,
    holderName: instr.cardHolderName,
    fingerprint: raw.namespace,
    gateway: 'worldpay-fis',
    metadata: strMap({
      namespace: raw.namespace,
      description: raw.description,
      fundingType: instr.fundingType,
      bin: instr.bin,
      networkType: instr.networkType,
    }),
    createdAt: undefined,
    updatedAt: undefined,
    raw,
  }
}
