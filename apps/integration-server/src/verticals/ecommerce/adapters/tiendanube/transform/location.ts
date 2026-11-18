/**
 * Tiendanube / Nuvemshop Location → canonical Location.
 *
 * Key differences from Shopify:
 *  - `name` is an i18n object (e.g. `{ es_AR: "Depósito Central" }`).
 *  - Address is nested under `address` with `street`, `number`, `city`,
 *    `province` (object), `country` (object), `zipcode`.
 *  - No explicit `active` field; presence implies active.
 *  - `is_default` indicates the primary fulfillment location.
 *
 * Docs: https://tiendanube.github.io/api-documentation/resources/location
 */

import type { Location } from '../../../schema/location'
import type { Address } from '../../../schema/shared'

type I18nString = Record<string, string | null | undefined>

function i18n(obj: I18nString | string | null | undefined): string | undefined {
  if (obj == null) return undefined
  if (typeof obj === 'string') return obj || undefined
  // Location names use locale codes like 'es_AR', 'pt_BR', 'en_US'
  return (
    obj['en_US'] ??
    obj['en'] ??
    obj['es_AR'] ??
    obj['es'] ??
    obj['pt_BR'] ??
    obj['pt'] ??
    Object.values(obj).find((x) => x != null) ??
    undefined
  )
}

// ── Raw shapes ────────────────────────────────────────────────────────────────

export interface RawTiendanubeLocationProvince {
  code?: string | null
  name?: string | null
}

export interface RawTiendanubeLocationCountry {
  code?: string | null
  name?: string | null
}

export interface RawTiendanubeLocationAddress {
  zipcode?: string | null
  street?: string | null
  number?: string | null
  floor?: string | null
  locality?: string | null
  city?: string | null
  province?: RawTiendanubeLocationProvince | null
  country?: RawTiendanubeLocationCountry | null
  [key: string]: unknown
}

export interface RawTiendanubeLocation {
  id: string | number
  name?: I18nString | string | null
  store_id?: string | number
  priority?: number
  is_default?: boolean
  address?: RawTiendanubeLocationAddress | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapAddress(raw: RawTiendanubeLocationAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const street = raw.street ?? undefined
  const city = raw.city ?? undefined
  const postalCode = raw.zipcode ?? undefined
  const country = raw.country?.code ?? undefined
  if (!street && !city && !postalCode && !country) return undefined
  return {
    line1: [street, raw.number].filter(Boolean).join(' ') || undefined,
    line2: raw.floor ?? undefined,
    city,
    region: raw.province?.code ?? raw.province?.name ?? undefined,
    postalCode,
    country,
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformLocation(raw: RawTiendanubeLocation): Location {
  return {
    id: String(raw.id),
    name: i18n(raw.name as I18nString | string | null | undefined) ?? '',
    active: true, // Tiendanube locations are always considered active
    address: mapAddress(raw.address),
    isFulfillmentCenter: true, // all Tiendanube locations can fulfill orders
    metadata: raw as unknown as Record<string, unknown>,
  }
}
