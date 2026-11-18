export function pickStr(v: unknown): string | undefined {
  if (typeof v === 'string' && v.length > 0) return v
  return undefined
}

export function strMap(input: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input)) {
    if (v === null || v === undefined) continue
    if (typeof v === 'object') continue
    out[k] = String(v)
  }
  return out
}

/**
 * WeSign's own client treats a date before 2015 as "never happened", because
 * the API serialises an unset non-nullable DateTime as year 1:
 *   https://wse.comsigntrust.com/chunk-P6SUSW6D.js
 *     var N=2015 ... function v(e){if(e==null||e==="")return!0;let t=y(e);
 *     return Number.isNaN(t.getTime())?!0:t.getFullYear()<N}
 * and it reads a zone-less `yyyy-MM-ddTHH:mm[:ss[.f]]` string as UTC:
 *     M=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;
 *     function y(e){return ... typeof e=="string"&&M.test(e)?new Date(`${e}Z`):new Date(e)}
 * The same rule is applied here, so a placeholder never becomes a timestamp.
 */
const ZONELESS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/
const FIRST_REAL_YEAR = 2015

export function weSignDate(v: unknown): string | undefined {
  const s = pickStr(v)
  if (!s) return undefined
  const d = new Date(ZONELESS.test(s) ? `${s}Z` : s)
  if (Number.isNaN(d.getTime())) return undefined
  if (d.getUTCFullYear() < FIRST_REAL_YEAR) return undefined
  return d.toISOString()
}
