/**
 * Odoo's read format, shared by every transform here.
 *
 * Many2one fields read as `[id, display_name]` and an empty field of any type
 * reads as `false` — the search_read example on
 * https://www.odoo.com/documentation/19.0/developer/reference/external_rpc_api.html
 * shows `'country_id': [21, 'Belgium']` and `'comment': False`. Many2many and
 * One2many fields read as a list of ids.
 *
 * Every field is optional in the Raw types: the shared client reads only the
 * fields `fields_get` reports on the customer's server, so a field this Odoo
 * version lacks is simply absent from the row.
 */
import { toIsoDatetime } from '@opensteward/shared'

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

/** A Many2many / One2many value (a list of ids) as string ids; anything else is none. */
export function x2manyIds(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number').map(String) : []
}

/**
 * Odoo datetimes are "YYYY-MM-DD HH:MM:SS" and "must be UTC-only" (19.0 ORM
 * reference, Date(time) Fields); toIsoDatetime reads an offset-less value as
 * UTC and a date-only value ("YYYY-MM-DD", fields.Date) as UTC midnight.
 */
export function odooIso(v: string | false | undefined): string | undefined {
  return typeof v === 'string' && v ? toIsoDatetime(v) : undefined
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  '#39': "'",
  nbsp: ' ',
}

/**
 * Plain text of a `fields.Html` value (task and project `description`,
 * mail.message `body`): line breaks for `<br>` and closing block tags, other
 * tags dropped, the common entities decoded.
 */
export function htmlText(html: string | false | undefined): string | undefined {
  if (typeof html !== 'string' || !html) return undefined
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|blockquote|pre)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e: string) => ENTITIES[e] ?? '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return text || undefined
}

/** metadata values are strings; drop the empty ones. */
export function meta(entries: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(entries)) if (v !== undefined) out[k] = v
  return out
}
