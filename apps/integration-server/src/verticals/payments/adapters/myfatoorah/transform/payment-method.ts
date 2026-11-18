import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'
import { strMap } from './shared'

// Derived from GetPaymentStatus (v2/getPaymentStatus) — the Card sub-object
// within InvoiceTransactions contains tokenised card data.
export interface RawMyfatoorahCard {
  [k: string]: unknown
}

function mapType(brand: string | undefined | null): PaymentMethodType {
  if (!brand) return 'other'
  const b = brand.toLowerCase()
  if (b === 'knet' || b === 'mada' || b === 'benefit' || b === 'naps') return 'card'
  if (b === 'apple_pay' || b === 'applepay' || b === 'google_pay' || b === 'googlepay' || b === 'stc_pay') return 'wallet'
  return 'card'
}

function parseLast4(number: string | undefined | null): string | undefined {
  if (!number) return undefined
  // MyFatoorah returns masked numbers like "512345xxxxxx0008" — take last 4 digits
  const digits = number.replace(/\D/g, '')
  return digits.length >= 4 ? digits.slice(-4) : undefined
}

function parseExpMonth(v: unknown): number | undefined {
  const n = parseInt(String(v ?? ''), 10)
  return isFinite(n) && n >= 1 && n <= 12 ? n : undefined
}

function parseExpYear(v: unknown): number | undefined {
  const n = parseInt(String(v ?? ''), 10)
  return isFinite(n) && n > 0 ? n : undefined
}

export function transformPaymentMethod(raw: RawMyfatoorahCard): PaymentMethod {
  const brand = raw['Brand'] != null ? String(raw['Brand']) : undefined

  return {
    id: raw['Token'] != null ? String(raw['Token']) : String(raw['PanHash'] ?? ''),
    externalId: raw['Token'] != null ? String(raw['Token']) : String(raw['PanHash'] ?? ''),
    type: mapType(brand),
    brand,
    last4: parseLast4(raw['Number'] as string | undefined),
    expMonth: parseExpMonth(raw['ExpiryMonth']),
    expYear: parseExpYear(raw['ExpiryYear']),
    holderName: raw['NameOnCard'] != null ? String(raw['NameOnCard']) : undefined,
    fingerprint: raw['PanHash'] != null ? String(raw['PanHash']) : undefined,
    gateway: 'myfatoorah',
    metadata: strMap({}),
    raw,
  }
}
