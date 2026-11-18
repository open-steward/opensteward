import type { Carrier } from '../../../schema/carrier'

/**
 * iMile Express does not expose a /carrier listing endpoint.
 * The carrier is the platform itself — a single static record derived from
 * the adapter's own identity and publicly documented service codes.
 *
 * iMile operates as a last-mile carrier across the Middle East, South Asia,
 * and Africa.  Service codes are returned dynamically via the rate/query
 * endpoint (serviceType field), but the carrier identity is fixed.
 *
 * Source: https://www.imile.com/developer
 */
export function getIMileCarrier(): Carrier {
  return {
    id: 'imile',
    name: 'iMile Express',
    code: 'imile',
    trackingUrlTemplate: 'https://www.imile.com/tracking?waybillNo={trackingNumber}',
    services: [
      { code: 'STANDARD', name: 'iMile Standard Delivery' },
      { code: 'EXPRESS', name: 'iMile Express Delivery' },
      { code: 'ECONOMY', name: 'iMile Economy Delivery' },
      { code: 'SAME_DAY', name: 'iMile Same-Day Delivery' },
      { code: 'NEXT_DAY', name: 'iMile Next-Day Delivery' },
      { code: 'RETURN', name: 'iMile Return Service' },
    ],
    isActive: true,
    metadata: { source: 'static' },
  }
}
