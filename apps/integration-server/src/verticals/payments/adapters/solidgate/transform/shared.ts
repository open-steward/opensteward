/**
 * Solidgate datetimes are "YYYY-MM-DD HH:MM:SS" (pattern
 * `^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$`), and the reports state them "in
 * UTC+0". Anything else is dropped rather than guessed at.
 */
export function sgDatetime(v: string | null | undefined): string | undefined {
  if (typeof v !== 'string') return undefined
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(v)
  return m ? `${m[1]}T${m[2]}Z` : undefined
}

/** Metadata maps are documented as string → string; non-strings are skipped. */
export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v
  }
  return out
}
