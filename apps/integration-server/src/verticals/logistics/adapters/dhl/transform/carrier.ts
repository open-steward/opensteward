import type { Carrier } from '../../../schema/carrier'

/**
 * DHL Express does not expose a /carriers listing endpoint.
 * The carrier is the platform itself — a single static record derived from
 * the adapter's own identity and publicly documented service codes.
 *
 * Source: https://developer.dhl.com/api-reference/mydhl-api-dhl-express
 * The products/services are returned via the /rates endpoint (productCode field).
 */
export function getDHLCarrier(): Carrier {
  return {
    id: 'dhl',
    name: 'DHL Express',
    code: 'dhl',
    trackingUrlTemplate: 'https://www.dhl.com/en/express/tracking.html?AWB={trackingNumber}',
    services: [
      { code: 'P', name: 'DHL Express Worldwide' },
      { code: 'D', name: 'DHL Express Worldwide (Dutiable)' },
      { code: 'U', name: 'DHL Express Worldwide (Non-Dutiable)' },
      { code: 'K', name: 'DHL Express 9:00' },
      { code: 'T', name: 'DHL Express 12:00' },
      { code: 'Y', name: 'DHL Express 12:00 (Dutiable)' },
      { code: 'W', name: 'DHL Economy Select' },
    ],
    isActive: true,
    metadata: { source: 'static' },
  }
}
