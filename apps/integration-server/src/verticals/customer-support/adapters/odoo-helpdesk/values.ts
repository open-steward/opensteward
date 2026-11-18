/**
 * Odoo's read format, shared by every transform here.
 *
 * Many2one fields read as `[id, display_name]` and an empty field of any type
 * reads as `false` — the search_read example on
 * https://www.odoo.com/documentation/19.0/developer/reference/external_rpc_api.html
 * shows `'country_id': [21, 'Belgium']` and `'comment': False`.
 */
import { toIsoDatetime } from '@opensteward/shared'
import { z } from 'zod'

export type Many2one = [number, string] | false | null

export function strOrUndef(v: string | false | null | undefined): string | undefined {
  return typeof v === 'string' && v ? v : undefined
}

export function many2oneId(v: Many2one | undefined): string | undefined {
  return Array.isArray(v) && typeof v[0] === 'number' ? String(v[0]) : undefined
}

export function many2oneNum(v: Many2one | undefined): number | undefined {
  return Array.isArray(v) && typeof v[0] === 'number' ? v[0] : undefined
}

export function many2oneName(v: Many2one | undefined): string | undefined {
  return Array.isArray(v) && typeof v[1] === 'string' && v[1] ? v[1] : undefined
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

/**
 * res.partner `email` is a free `fields.Char()` (odoo/addons/base/models/
 * res_partner.py, 14.0–19.0), so it can hold anything; the canonical email is
 * only set when it is one address.
 */
export function emailOrUndef(v: string | false | undefined): string | undefined {
  const s = strOrUndef(v)?.trim()
  return s && z.email().safeParse(s).success ? s : undefined
}

/** Text of a `fields.Html` value (mail.message `body`). */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim()
}
