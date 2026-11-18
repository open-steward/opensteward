/**
 * "**Tous les horodatages sont exprimés en millisecondes** depuis le 1ᵉʳ
 * janvier 1970 (millisecondes, et non secondes — à prendre en compte lors des
 * conversions). Exemple : `"created": 1783777360803`."
 * (https://docs.goodflag.com/wm/api-reference/structure.md)
 */
export function msToIso(ms: unknown): string | undefined {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return undefined
  const d = new Date(ms)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

/** A non-empty string, or undefined. */
export function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

/** "First Last" from the documented `firstName` / `lastName` pair, skipping blanks. */
export function fullName(firstName: unknown, lastName: unknown): string | undefined {
  const name = [str(firstName), str(lastName)].filter((s): s is string => Boolean(s)).join(' ')
  return name.length > 0 ? name : undefined
}
