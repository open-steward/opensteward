import type { Carrier } from '../../../schema/carrier'

// ─── XPO carrier (derived — static) ─────────────────────────────────────────
//
// XPO Logistics is itself a single LTL carrier. There is no REST API endpoint
// that returns a list of carriers — the carrier entity is the platform itself.
// We derive it from static metadata (SCAC: XPOL, LTL mode).

export function transformCarrier(): Carrier {
  return {
    id: 'xpo',
    name: 'XPO Logistics',
    code: 'xpo',
    trackingUrlTemplate:
      'https://ltl.xpo.com/shipment-tracking?proNumber={trackingNumber}',
    isActive: true,
    metadata: {
      scac: 'XPOL',
      serviceType: 'LTL',
    },
  }
}
