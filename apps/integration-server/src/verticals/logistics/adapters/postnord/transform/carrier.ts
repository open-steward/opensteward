import type { Carrier } from '../../../schema/carrier'

// ─── Static record ──────────────────────────────────────────────────────────
//
// PostNord is itself the single carrier. There is no /carriers list endpoint
// in their public API. We return a single static Carrier record derived from
// the platform's known identity and tracking URL pattern.
//
// Source: https://developer.postnord.com/ (tracking URL confirmed via
//         postnord-ab-production.3scale.net and Norway developer portal)

export function transformCarrier(): Carrier {
  return {
    id: 'postnord',
    name: 'PostNord',
    code: 'postnord',
    trackingUrlTemplate:
      'https://www.postnord.com/en/our-tools/track-and-trace?shipmentId={trackingNumber}',
    isActive: true,
  }
}
