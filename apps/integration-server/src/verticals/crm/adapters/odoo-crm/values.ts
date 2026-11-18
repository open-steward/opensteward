/**
 * Odoo's read format, shared by every transform here.
 *
 * Many2one fields read as `[id, display_name]` — e.g. `"country_id": [ 21,
 * "Belgium" ]` in the search_read result on
 * https://www.odoo.com/documentation/17.0/developer/reference/external_api.html
 * — and an empty field of any type reads as `false` (`"comment": false` in the
 * same example).
 */
export type Many2one = [number, string] | false | null

export function strOrUndef(v: string | false | null | undefined): string | undefined {
  if (!v) return undefined
  return v
}

export function many2oneId(v: Many2one | undefined): string | undefined {
  return Array.isArray(v) && typeof v[0] === 'number' ? String(v[0]) : undefined
}

export function many2oneName(v: Many2one | undefined): string | undefined {
  return Array.isArray(v) && typeof v[1] === 'string' && v[1] ? v[1] : undefined
}

/** Strip tags from an `fields.Html` value (`note`, `body`). */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim()
}
