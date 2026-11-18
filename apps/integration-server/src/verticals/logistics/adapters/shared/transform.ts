import type { Address, Weight, Dimensions } from '../../schema/shared'

/**
 * Normalise an address from a raw platform object.
 * Returns undefined if all fields are absent.
 */
export function toAddress(raw: Record<string, unknown> | null | undefined): Address | undefined {
  if (!raw) return undefined
  const addr: Address = {
    name: str(raw.full_name ?? raw.name),
    company: str(raw.company ?? raw.company_name),
    street1: str(raw.street1 ?? raw.address1 ?? raw.address_line1 ?? raw.line1),
    street2: str(raw.street2 ?? raw.address2 ?? raw.address_line2 ?? raw.line2),
    city: str(raw.city),
    state: str(raw.state ?? raw.state_province ?? raw.region ?? raw.province),
    postalCode: str(raw.postalCode ?? raw.postal_code ?? raw.zip ?? raw.zip_code),
    country: str(raw.country ?? raw.countryCode ?? raw.country_code),
    phone: str(raw.phone ?? raw.phone_number),
    email: str(raw.email),
  }
  const hasAny = Object.values(addr).some((v) => v !== undefined)
  return hasAny ? addr : undefined
}

/**
 * Normalise a weight value + unit.
 */
export function toWeight(
  value: unknown,
  unit: 'oz' | 'lb' | 'g' | 'kg' = 'oz',
): Weight | undefined {
  const v = parseDecimal(value)
  if (v === undefined) return undefined
  return { value: v, unit }
}

/**
 * Normalise package dimensions.
 */
export function toDimensions(
  length: unknown,
  width: unknown,
  height: unknown,
  unit: 'in' | 'cm' = 'in',
): Dimensions | undefined {
  const l = parseDecimal(length)
  const w = parseDecimal(width)
  const h = parseDecimal(height)
  if (l === undefined || w === undefined || h === undefined) return undefined
  return { length: l, width: w, height: h, unit }
}

/**
 * Safe parseFloat. Returns undefined for NaN/null/undefined.
 * Preserves 0.
 */
export function parseDecimal(val: unknown): number | undefined {
  if (val === null || val === undefined || val === '') return undefined
  const n = typeof val === 'number' ? val : parseFloat(String(val))
  return isNaN(n) ? undefined : n
}

/**
 * Returns undefined instead of an empty array.
 */
export function nonempty<T>(arr: T[] | undefined): T[] | undefined {
  return arr && arr.length > 0 ? arr : undefined
}

/**
 * Safely parse any date string or timestamp to a Date object.
 */
export function toISODate(val: unknown): Date | undefined {
  if (!val) return undefined
  const d = new Date(val as string | number)
  return isNaN(d.getTime()) ? undefined : d
}

// ─── internal helpers ───────────────────────────────────────────────────────

function str(val: unknown): string | undefined {
  if (val === null || val === undefined || val === '') return undefined
  return String(val)
}
