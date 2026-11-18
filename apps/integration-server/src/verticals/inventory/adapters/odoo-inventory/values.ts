/**
 * Odoo's read format, shared by every transform here.
 *
 * Many2one fields read as `[id, display_name]` and an empty field of any type
 * reads as `false` — the search_read example on
 * https://www.odoo.com/documentation/19.0/developer/reference/external_rpc_api.html
 * shows `'country_id': [21, 'Belgium']` and `'comment': False`.
 */
import { Iso4217Currency, majorToMinor, toIsoDatetime } from '@opensteward/shared'

export type Many2one = [number, string] | false | null

export function strOrUndef(v: string | false | null | undefined): string | undefined {
  return typeof v === 'string' && v ? v : undefined
}

export function many2oneId(v: Many2one | undefined): string | undefined {
  return Array.isArray(v) && typeof v[0] === 'number' ? String(v[0]) : undefined
}

export function many2oneName(v: Many2one | undefined): string | undefined {
  return Array.isArray(v) && typeof v[1] === 'string' && v[1] ? v[1] : undefined
}

/**
 * The ISO code of a `res.currency` Many2one. Its display name is its `name`:
 * `name = fields.Char(string='Currency', size=3, required=True, help="Currency
 * Code (ISO 4217)")` (odoo/addons/base/models/res_currency.py, 19.0).
 */
export function currencyCode(v: Many2one | undefined): string | undefined {
  const name = many2oneName(v)
  return name && Iso4217Currency.safeParse(name).success ? name : undefined
}

/** A Float/Monetary in major units → minor units of `currency`, or undefined without one. */
export function minor(
  value: number | false | undefined,
  currency: string | undefined,
): number | undefined {
  if (typeof value !== 'number' || !currency) return undefined
  return majorToMinor(value, currency)
}

/**
 * Odoo datetimes are "YYYY-MM-DD HH:MM:SS" and "must be UTC-only" (19.0 ORM
 * reference, Date(time) Fields); toIsoDatetime reads an offset-less value as UTC.
 */
export function odooIso(v: string | false | undefined): string | undefined {
  return typeof v === 'string' && v ? toIsoDatetime(v) : undefined
}

/** metadata values are strings; drop the empty ones. */
export function meta(entries: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(entries)) if (v !== undefined) out[k] = v
  return out
}
