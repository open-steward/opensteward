/**
 * Odoo's read format, shared by every transform here.
 *
 * Many2one fields read as `[id, display_name]` and an empty field of any type
 * reads as `false` — the search_read example on
 * https://www.odoo.com/documentation/19.0/developer/reference/external_rpc_api.html
 * shows `'country_id': [21, 'Belgium']` and `'comment': False`.
 *
 * Every model this adapter reads also has the automatic fields the same page's
 * fields_get example lists for a brand-new model: `id`, `display_name`,
 * `create_uid` ("Created by", many2one), `create_date` ("Created on"),
 * `write_uid` and `write_date` ("Last Updated on"). The ORM reference
 * (https://www.odoo.com/documentation/19.0/developer/reference/backend/orm.html,
 * Automatic fields) describes `create_uid` as "Stores who created the record,
 * Many2one to a res.users".
 */
import { z } from 'zod'
import { toIsoDatetime } from '@opensteward/shared'

export type Many2one = [number, string] | false | null

export function strOrUndef(v: string | false | null | undefined): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

export function many2oneId(v: Many2one | undefined): string | undefined {
  return Array.isArray(v) && typeof v[0] === 'number' ? String(v[0]) : undefined
}

export function many2oneName(v: Many2one | undefined): string | undefined {
  return Array.isArray(v) && typeof v[1] === 'string' && v[1] ? v[1] : undefined
}

/**
 * Odoo datetimes are "YYYY-MM-DD HH:MM:SS" and "must be UTC-only" (19.0 ORM
 * reference, Date(time) Fields); toIsoDatetime reads an offset-less value as
 * UTC and a date-only value as UTC midnight.
 */
export function odooIso(v: string | false | null | undefined): string | undefined {
  return typeof v === 'string' && v ? toIsoDatetime(v) : undefined
}

const Email = z.email()

/** A value the canonical `z.email()` accepts, or undefined (Odoo does not validate `signer_email`). */
export function emailOrUndef(v: string | false | null | undefined): string | undefined {
  const s = strOrUndef(v)
  return s && Email.safeParse(s).success ? s : undefined
}

/** Integer ids of a One2many/Many2many read (a list of ids), in ascending order. */
export function idList(v: unknown): number[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((x): x is number => typeof x === 'number' && Number.isInteger(x))
    .sort((a, b) => a - b)
}

/** metadata values are strings; drop the empty ones. */
export function meta(entries: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(entries)) if (v !== undefined) out[k] = v
  return out
}
