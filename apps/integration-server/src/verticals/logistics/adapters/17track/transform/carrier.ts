import type { Carrier } from '../../../schema/carrier'

// ── Raw API types ─────────────────────────────────────────────────────────────

export interface Track17CarrierRaw {
  key: number
  _country?: number | null
  _country_iso?: string | null
  _email?: string | null
  _tel?: string | null
  _url?: string | null
  _name?: string | null
  'name_zh-cn'?: string | null
  'name_zh-hk'?: string | null
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

/**
 * Transform a single entry from the 17TRACK carrier list JSON
 * (https://res.17track.net/asset/carrier/info/apicarrier.all.json)
 * into the canonical Carrier shape.
 */
export function transformCarrier(raw: Track17CarrierRaw): Carrier {
  const trackingUrl = raw._url
    ? raw._url.replace(/\/$/, '') + '/{trackingNumber}'
    : undefined

  return {
    id: String(raw.key),
    name: raw._name ?? undefined,
    code: String(raw.key),
    trackingUrlTemplate: trackingUrl,
    isActive: true,
    metadata: raw as Record<string, unknown>,
  } satisfies Carrier
}
