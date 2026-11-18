import type { Carrier } from '../../../schema/carrier'

// ─── Dayton Freight carrier (static / derived) ──────────────────────────────
//
// Dayton Freight does not expose a "list carriers" REST endpoint — it is itself
// a single regional LTL carrier. The carrier record is derived from publicly
// documented service offerings at daytonfreight.com.

/**
 * Publicly documented Dayton Freight Lines service levels.
 * Source: daytonfreight.com/guaranteed-service and IT integration page.
 */
const DAYTON_FREIGHT_SERVICES = [
  { code: 'STD', name: 'Standard LTL' },
  { code: 'AM', name: 'AM Guaranteed (by 12pm)' },
  { code: 'PM', name: 'PM Guaranteed (by 5pm)' },
  { code: 'DFX', name: 'DFXpedited (time-critical)' },
]

export function transformCarrier(): Carrier {
  return {
    id: 'dayton-freight',
    name: 'Dayton Freight Lines',
    code: 'dayton-freight',
    trackingUrlTemplate:
      'https://www.daytonfreight.com/track-your-shipment/?proNumber={trackingNumber}',
    services: DAYTON_FREIGHT_SERVICES.map((s) => ({
      code: s.code,
      name: s.name,
    })),
    isActive: true,
    metadata: { source: 'static' } as Record<string, unknown>,
  }
}
