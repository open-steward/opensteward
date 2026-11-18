/**
 * Shared field readers for Twproject objects.
 *
 * Twproject documents two date shapes on its objects: `timestamp`, "An integer
 * number representing the millisecond elapsed from Epoch" (`start`, `end`,
 * `creationDate`, `lastModified` in the response examples), and `date`, "A
 * string representing a date in user format" (`startDate`, `endDate`). Only
 * the epoch timestamps are read: the user-format strings depend on the
 * operator's locale.
 */

/** Epoch milliseconds → ISO-8601, or undefined when absent or not a number. */
export function epochMsToIso(v: unknown): string | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined
  return new Date(v).toISOString()
}

/** A non-empty string, or undefined. */
export function nonEmpty(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

/** Keep the scalar, non-empty entries as strings. */
export function strMap(input: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input)) {
    if (v === null || v === undefined || v === '') continue
    if (typeof v === 'object') continue
    out[k] = String(v)
  }
  return out
}
