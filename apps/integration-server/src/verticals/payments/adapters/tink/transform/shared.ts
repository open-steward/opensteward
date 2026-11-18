/**
 * Shapes and helpers shared by the Tink settlement-account transforms.
 *
 * Source: https://docs.tink.com/api#payment/settlement-accounts (the rendered
 * reference in https://docs.tink.com/assets/ApiReferenceSectionLazy-DUqT4U4u.js).
 */
import { minorUnitExponent } from '@opensteward/shared'

/**
 * ExactNumber: "unscaledValue is used with scale to accurately represent
 * floating point values. The formula is unscaledValue * (10^-scale) . For
 * example, if scale is 1 and unscaledValue is 1230, the end result would be
 * 123.0." Both are typed `string`.
 */
export interface RawExactNumber {
  scale?: string | number
  unscaledValue?: string | number
}

/**
 * CurrencyDenominatedAmount: `currencyCode` "The currency code which follows
 * ISO-4217 standard." and `value` "The value representation of the monetary
 * amount."
 */
export interface RawCurrencyDenominatedAmount {
  currencyCode?: string
  value?: RawExactNumber
}

/** AccountDetails: `account` {identifier, type}, `beneficiaryId`, `name`. */
export interface RawAccountDetails {
  account?: { identifier?: string; type?: string }
  beneficiaryId?: string
  name?: string
}

/** SettlementAccountTransaction, every documented field. */
export interface RawTinkTransaction {
  accountBalance?: RawCurrencyDenominatedAmount
  amount?: RawCurrencyDenominatedAmount
  id?: string
  merchantId?: string
  metadata?: Record<string, unknown> | null
  originalTransactionId?: string
  payee?: RawAccountDetails
  payer?: RawAccountDetails
  paymentRequestId?: string
  reference?: string
  timestamp?: string
  type?: string
  verificationStatus?: string
}

function integerText(v: unknown): string | undefined {
  const s = typeof v === 'number' && Number.isInteger(v) ? String(v) : v
  return typeof s === 'string' && /^-?\d+$/.test(s.trim()) ? s.trim() : undefined
}

/**
 * A CurrencyDenominatedAmount as integer minor units of its own currency:
 * unscaledValue * 10^(exponent - scale). Throws when the currency or the
 * value is missing, or when the value has more decimals than the currency's
 * minor unit (rounding would invent money).
 */
export function amountToMinor(
  amount: RawCurrencyDenominatedAmount | undefined,
  what: string,
): { amount: number; currency: string } {
  const code = typeof amount?.currencyCode === 'string' ? amount.currencyCode.trim() : ''
  if (!code) throw new Error(`Tink ${what} has no amount.currencyCode`)
  const currency = code.toUpperCase()
  const unscaled = integerText(amount?.value?.unscaledValue)
  const scale = integerText(amount?.value?.scale)
  if (unscaled === undefined || scale === undefined) {
    throw new Error(`Tink ${what} has no integer amount.value.unscaledValue/scale`)
  }
  const shift = minorUnitExponent(currency) - Number(scale)
  let minor = BigInt(unscaled)
  if (shift >= 0) {
    minor *= 10n ** BigInt(shift)
  } else {
    const divisor = 10n ** BigInt(-shift)
    if (minor % divisor !== 0n) {
      throw new Error(
        `Tink ${what} amount ${unscaled}e-${scale} ${currency} is finer than the currency's minor unit`,
      )
    }
    minor /= divisor
  }
  if (minor > BigInt(Number.MAX_SAFE_INTEGER) || minor < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error(`Tink ${what} amount is outside the safe integer range`)
  }
  return { amount: Number(minor), currency }
}

/** A documented Date string as ISO 8601, or undefined when absent or unparseable. */
export function isoDate(v: unknown): string | undefined {
  if (typeof v !== 'string' || v === '') return undefined
  const ms = Date.parse(v)
  return Number.isNaN(ms) ? undefined : new Date(ms).toISOString()
}

/** A metadata dictionary with string values ("All keys and values must be strings."). */
export function stringMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = String(v)
  }
  return out
}

/** A non-empty string, else undefined. */
export function text(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined
}

/** The record's id, or a throw: the canonical id is required and never invented. */
export function requireId(v: unknown, what: string): string {
  const id = text(v)
  if (!id) throw new Error(`Tink ${what} is missing id`)
  return id
}
