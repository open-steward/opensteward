import type { Carrier } from '../../../schema/carrier'

// ─── Canpar carrier (static / derived) ─────────────────────────────────────
//
// Canpar does not expose a "list carriers" endpoint — it is itself a single
// carrier. The carrier record is derived from the known public constants for
// Canpar Express.

export interface CanparServiceDefinition {
  code: string
  name: string
}

/**
 * Static list of Canpar Express service codes documented publicly.
 * Source: Canpar developer guide / EasyPost Canpar carrier guide.
 */
const CANPAR_SERVICES: CanparServiceDefinition[] = [
  { code: '1', name: 'Canpar Ground' },
  { code: '2', name: 'Canpar USA' },
  { code: '3', name: 'Canpar Overnight' },
  { code: '4', name: 'Canpar Select' },
  { code: '5', name: 'Canpar Select Letter' },
  { code: '6', name: 'Canpar Overnight Letter' },
]

export function transformCarrier(): Carrier {
  return {
    id: 'canpar',
    name: 'Canpar Express',
    code: 'canpar',
    trackingUrlTemplate: 'https://www.canpar.com/en/track/TrackingResults.do?reference={trackingNumber}',
    services: CANPAR_SERVICES.map((s) => ({
      code: s.code,
      name: s.name,
    })),
    isActive: true,
    metadata: { source: 'static' } as Record<string, unknown>,
  }
}
