export function pickStr(v: unknown): string | undefined {
  if (typeof v === 'string' && v.length > 0) return v
  if (v == null) return undefined
  return String(v)
}

export function pickNum(v: unknown): number | undefined {
  if (typeof v === 'number') return v
  if (typeof v === 'string' && v !== '') {
    const n = Number(v)
    if (!Number.isNaN(n)) return n
  }
  return undefined
}

export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === null || v === undefined) continue
    if (typeof v === 'object') continue
    out[k] = String(v)
  }
  return out
}

/**
 * Convert a CSC certificate validity date to strict ISO-8601.
 *
 * The CSC API encodes `cert/validFrom` and `cert/validTo` as X.509v3
 * GeneralizedTime (RFC 5280), e.g. `"20180101100000Z"` — which `new Date()`
 * does NOT parse. We canonicalise GeneralizedTime to ISO-8601, and fall back
 * to `Date` parsing for any provider that already returns ISO strings.
 *
 * Returns undefined on any unparseable input — transforms NEVER throw.
 */
export function toIso(s: unknown): string | undefined {
  const str = pickStr(s)
  if (!str) return undefined

  // GeneralizedTime: YYYYMMDDHHMMSS[.fff](Z|±HHMM). Match the common forms.
  const gt = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.\d+)?(Z|[+-]\d{2}\d{2})?$/.exec(str)
  if (gt) {
    const [, y, mo, d, h, mi, se, tz] = gt
    let iso = `${y}-${mo}-${d}T${h}:${mi}:${se}`
    if (!tz || tz === 'Z') iso += 'Z'
    else iso += `${tz.slice(0, 3)}:${tz.slice(3)}`
    const dt = new Date(iso)
    if (!Number.isNaN(dt.getTime())) return dt.toISOString()
  }

  const d = new Date(str)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

/**
 * Extract a CN (or other RDN) value from an RFC 4514 Distinguished Name string,
 * e.g. `CN=Jane Doe,O=Acme,C=ES` → `Jane Doe`. Returns undefined if absent.
 */
export function rdn(dn: string | undefined, attr: string): string | undefined {
  if (!dn) return undefined
  const re = new RegExp(`(?:^|,)\\s*${attr}=([^,]+)`, 'i')
  const m = re.exec(dn)
  return m?.[1]?.trim() || undefined
}
