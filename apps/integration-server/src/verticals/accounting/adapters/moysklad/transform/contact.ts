import type { Contact } from '../../../schema/contact'
import { toIso3166Alpha2 } from '../../../../shared/iso-normalise'

export interface MoyskladContact {
  id?: string
  name?: string
  email?: string
  phone?: string
  inn?: string
  legalAddress?: {
    city?: string
    // MoySklad's own JSON API docs (dictionaries/_counterparty.md) document
    // `legalAddressFull.country` as country METADATA — an href-only
    // reference (`{ meta: { href, type, ... } }`), with no `name` inline
    // unless the request expands it. When expanded, the underlying Country
    // entity (dictionaries/_country.md) has a `name` that's localised to
    // the account's language (Russian in production, e.g. 'Россия') and a
    // `code` that is the ISO 3166-1 NUMERIC code (e.g. Morocco = '504'),
    // not alpha-2/alpha-3 — toIso3166Alpha2() does not resolve numeric
    // codes (documented gap, iso-normalise.ts). So neither field this
    // adapter could read is directly usable without either (a) resolving
    // country.meta.href with a follow-up request, or (b) adding numeric
    // ISO-3166 support to the shared helper. Of the two incomplete
    // options, `name` is the safer: the transform passes it through
    // toIso3166Alpha2(), which resolves it when the account language
    // yields a recognizable name.
    country?: { name?: string }
    [key: string]: unknown
  }
  [key: string]: unknown
}

export function transformContact(raw: MoyskladContact): Contact {
  return {
    id: raw.id ? String(raw.id) : '',
    name: raw.name || undefined,
    emails: raw.email ? [{ email: raw.email, type: 'WORK' }] : undefined,
    telephones: raw.phone ? [{ telephone: raw.phone, type: 'WORK' }] : undefined,
    taxNumber: raw.inn || undefined,
    billingAddress: (raw.legalAddress?.city || raw.legalAddress?.country?.name) ? {
      city: raw.legalAddress?.city || undefined,
      country: toIso3166Alpha2(raw.legalAddress?.country?.name),
    } : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
