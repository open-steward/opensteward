import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'
import { pickStr, strMap, toIso } from './shared'

/**
 * Computop stored payment-method (customer-vault) object. Only `CARD` and
 * `SEPA_DD` are exposed today. The card expiry arrives as a single
 * `expiryDate` string (typically `MM/YY` or `YYYY-MM`).
 */
export interface RawComputopPaymentMethod {
  id?: string
  type?: string
  last4Digits?: string
  pseudoCardNumber?: string
  cardHolderName?: string
  brand?: string
  expiryDate?: string
  createdAt?: string
  updatedAt?: string
  lastUsedAt?: string
  [k: string]: unknown
}

function mapType(type: string | undefined): PaymentMethodType {
  switch ((type ?? '').toUpperCase()) {
    case 'CARD':
      return 'card'
    case 'SEPA_DD':
    case 'DIRECTDEBIT':
      return 'bank_account'
    default:
      return 'other'
  }
}

/** Split a Computop `expiryDate` into numeric month/year, tolerant of shape. */
function splitExpiry(value: string | undefined): { month?: number; year?: number } {
  if (!value) return {}
  const parts = value.split(/[/\-.]/).map((p) => p.trim()).filter(Boolean)
  if (parts.length < 2) return {}
  // Order is ambiguous (MM/YY vs YYYY-MM); the 4-digit (or larger) part is the year.
  const [a, b] = parts
  const aNum = Number(a)
  const bNum = Number(b)
  if (!Number.isFinite(aNum) || !Number.isFinite(bNum)) return {}
  const aIsYear = a.length >= 4 || aNum > 12
  const month = aIsYear ? bNum : aNum
  let year = aIsYear ? aNum : bNum
  if (year < 100) year += 2000
  return {
    month: month >= 1 && month <= 12 ? month : undefined,
    year: Number.isFinite(year) ? year : undefined,
  }
}

export function transformPaymentMethod(
  raw: RawComputopPaymentMethod,
  customerId?: string,
): PaymentMethod {
  const id = pickStr(raw.id) ?? ''
  const { month, year } = splitExpiry(raw.expiryDate)
  return {
    id,
    externalId: id,
    customerId,
    type: mapType(raw.type),
    brand: pickStr(raw.brand)?.toLowerCase(),
    last4: pickStr(raw.last4Digits),
    expMonth: month,
    expYear: year,
    holderName: pickStr(raw.cardHolderName),
    gateway: 'computop',
    metadata: strMap({ pseudoCardNumber: raw.pseudoCardNumber, lastUsedAt: raw.lastUsedAt }),
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.updatedAt),
    raw,
  }
}
