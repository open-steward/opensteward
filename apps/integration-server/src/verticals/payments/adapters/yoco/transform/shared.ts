/**
 * Yoco `Money` (https://developer.yoco.com/openapi/yoco-api-reference.json):
 * `"required":["amount","currency"]`, and "The `amount` is always going to be
 * the smallest denomination of the given currency."
 */
export interface RawYocoMoney {
  amount: number
  currency: string
}

/** A documented `Money` field, read as is. Throws when it is absent or malformed. */
export function readMoney(value: unknown, field: string, id: string): RawYocoMoney {
  const m = value as Partial<RawYocoMoney> | null | undefined
  if (
    !m ||
    typeof m !== 'object' ||
    typeof m.amount !== 'number' ||
    !Number.isInteger(m.amount) ||
    typeof m.currency !== 'string' ||
    m.currency.length !== 3
  ) {
    throw new Error(`Yoco ${id}: ${field} is not a Money object`)
  }
  return { amount: m.amount, currency: m.currency.toUpperCase() }
}

/** A documented required id. Throws rather than inventing one. */
export function readId(value: unknown, what: string): string {
  if (typeof value !== 'string' || value === '') throw new Error(`Yoco ${what}: missing id`)
  return value
}

/** Documented nullable strings, dropped when null, into a string map. */
export function stringFields(
  raw: Record<string, unknown>,
  keys: readonly string[],
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const k of keys) {
    const v = raw[k]
    if (typeof v === 'string' && v !== '') out[k] = v
  }
  return out
}

/** A documented nullable date-time, or undefined. */
export function optionalString(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined
}
