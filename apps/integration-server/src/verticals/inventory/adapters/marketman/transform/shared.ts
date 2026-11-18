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

export function pickBool(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v
  if (v === 1 || v === '1' || v === 'true' || v === 'Y') return true
  if (v === 0 || v === '0' || v === 'false' || v === 'N') return false
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
 * MarketMan's documented wire format, `yyyy/mm/dd hh:mm:ss` (a bare date and
 * fractional seconds allowed). Only the slash form: see {@link toIso}.
 */
const ZONELESS =
  /^(\d{4})\/(\d{2})\/(\d{2})(?: (\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?)?$/

/**
 * A MarketMan date as an ISO instant.
 *
 * The docs' "Date format" note: "When receiving date value from the server,
 * it should be parsed as yyyy/mm/dd hh:mm:ss." It names no zone. The fields
 * read with this are named for UTC (`CountDateUTC`, `SentDateUTC`,
 * `DeliveryDateUTC`, `DateUTC`), and the docs bear the suffix out: CreateChecks
 * documents `DateTimeOpenUTC` as "Open date in UTC", and GetToken's saved
 * response, sent with `Date: Thu, 27 Feb 2020 07:34:01 GMT`, carries
 * `"ExpireDateUTC": "2020/03/05 07:34:01"`. `new Date('2023/01/09 11:19:30')`
 * reads the HOST's zone, so this format is read as UTC, whatever zone the
 * server runs in.
 *
 * Only the slash form. The docs' zoneless ISO values are not UTC. Three of the
 * four are order `CreatedDate` examples (GetOrdersBySentDate twice,
 * GetOrdersByDeliveryDate once), each four hours behind its `CreatedDateUTC`
 * twin, e.g. `"CreatedDate": "2025-02-16T05:28:43.95"` beside
 * `"CreatedDateUTC": "2025/02/16 09:28:43"`. The fourth, GetWeeklyOrdersByDate's
 * `"DeliveryDate": "2022-09-26T00:00:00"`, has no UTC twin. A field without
 * the UTC suffix is in a zone the docs do not name; GetInventoryItems'
 * `UpdateDate` is one (see product.ts). Any other shape goes to `new Date`,
 * and a value that carries its own zone keeps it.
 */
export function toIso(s: unknown): string | undefined {
  if (s == null) return undefined
  const str = (typeof s === 'string' ? s : String(s)).trim()
  if (!str) return undefined
  const m = ZONELESS.exec(str)
  if (m) {
    const [, y, mo, d, h = '0', mi = '0', sec = '0', frac = '0'] = m
    const t = Date.UTC(+y!, +mo! - 1, +d!, +h, +mi, +sec, +frac.padEnd(3, '0'))
    const date = new Date(t)
    // Date.UTC rolls 2023/02/30 over into March; that is not a date.
    if (Number.isNaN(t) || date.getUTCMonth() !== +mo! - 1 || date.getUTCDate() !== +d!) {
      return undefined
    }
    return date.toISOString()
  }
  const d = new Date(str)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}
