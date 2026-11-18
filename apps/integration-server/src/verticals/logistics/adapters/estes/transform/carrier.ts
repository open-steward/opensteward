import type { Carrier } from '../../../schema/carrier'

// ─── Estes carrier static definition ────────────────────────────────────────
//
// Estes Express Lines is itself a single LTL carrier. There is no REST API
// endpoint that returns a list of carriers — the carrier entity is the
// platform itself. We derive it from static metadata.

export function transformCarrier(): Carrier {
  return {
    id: 'estes',
    name: 'Estes Express Lines',
    code: 'estes',
    trackingUrlTemplate: 'https://www.estes-express.com/tools/tracking?proNumber={trackingNumber}',
    isActive: true,
    metadata: {
      scac: 'EXLA',
      serviceType: 'LTL',
    },
  }
}
