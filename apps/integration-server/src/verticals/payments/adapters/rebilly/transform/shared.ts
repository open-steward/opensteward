import { majorToMinor } from '@opensteward/shared'

/** `customFields` (ResourceCustomFields.yaml, an object) as string pairs. */
export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v == null) continue
    out[k] = typeof v === 'object' ? JSON.stringify(v) : String(v)
  }
  return out
}

export function str(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined
}

/** A documented id the canonical record requires; never defaulted. */
export function requireId(v: unknown, what: string): string {
  if (typeof v === 'string' && v !== '') return v
  throw new Error(`Rebilly ${what} is missing`)
}

/** CurrencyCode.yaml: "Currency code in ISO 4217 format." */
export function currencyOf(v: unknown): string | undefined {
  return typeof v === 'string' && /^[A-Za-z]{3}$/.test(v) ? v.toUpperCase() : undefined
}

/**
 * A required money pair: Rebilly amounts are `type: number, format: double`
 * in major units (`x-type: Money`), converted with the currency's exponent.
 */
export function requireMoney(
  amount: unknown,
  currency: unknown,
  what: string,
): { amount: number; currency: string } {
  const code = currencyOf(currency)
  if (typeof amount !== 'number' || !Number.isFinite(amount) || code === undefined) {
    throw new Error(`Rebilly ${what} has no amount/currency`)
  }
  return { amount: majorToMinor(amount, code), currency: code }
}

/** An optional money value in the record's currency; omitted when not reported. */
export function optionalMinor(amount: unknown, currency: string): number | undefined {
  return typeof amount === 'number' && Number.isFinite(amount)
    ? majorToMinor(amount, currency)
    : undefined
}

export function fullName(first: unknown, last: unknown): string | undefined {
  const name = [str(first), str(last)].filter(Boolean).join(' ').trim()
  return name === '' ? undefined : name
}
