/**
 * Zalando zDirect Logistic Centers → canonical Location.
 *
 * Zalando exposes merchant outbound warehouses (logistic centers) via:
 *
 *   GET /merchants/{merchant-id}/logistic-centers
 *   GET /merchants/{merchant-id}/logistic-centers/{logistic-center-id}
 *
 * The API returns:
 *   logistic_center_id — UUID
 *   name               — facility display name
 *   type               — facility classification (e.g. "OUTBOUND_WAREHOUSE")
 *   address            — nested { street, additional, city, zip, country_code }
 *
 * The list response wraps results in an `items` array (same envelope as all
 * other Zalando list endpoints).
 *
 * Docs: https://developers.merchants.zalando.com/docs/logistic-centers.html
 */

import type { Location } from '../../../schema/location'
import type { Address } from '../../../schema/shared'

// ── Raw Zalando shapes ────────────────────────────────────────────────────────

export interface RawZalandoLogisticCenterAddress {
  street?: string | null
  additional?: string | null
  city?: string | null
  zip?: string | null
  country_code?: string | null
}

export interface RawZalandoLogisticCenter {
  logistic_center_id: string
  name?: string | null
  /** Facility classification. "OUTBOUND_WAREHOUSE" is the only documented type. */
  type?: string | null
  address?: RawZalandoLogisticCenterAddress | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapAddress(
  raw: RawZalandoLogisticCenterAddress | null | undefined,
): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.street ?? undefined
  const city = raw.city ?? undefined
  const postalCode = raw.zip ?? undefined
  const country = raw.country_code ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.additional ?? undefined,
    city,
    postalCode,
    country,
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformLocation(raw: RawZalandoLogisticCenter): Location {
  return {
    id: raw.logistic_center_id,
    name: raw.name ?? raw.logistic_center_id,
    // Zalando does not expose an active/inactive flag; warehouses in the API
    // response have already passed the approval step, so treat them as active.
    active: true,
    address: mapAddress(raw.address),
    isFulfillmentCenter: raw.type === 'OUTBOUND_WAREHOUSE' ? true : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
