import type { Carrier } from '../../../schema/carrier'

// ─── Pitt Ohio carrier static definition ────────────────────────────────────
//
// PITT OHIO is itself a single regional LTL carrier. There is no REST API
// endpoint that returns a list of carriers — the carrier entity is the
// platform itself. We derive it from static metadata known about the carrier.

export function transformCarrier(): Carrier {
  return {
    id: 'pitt-ohio',
    name: 'PITT OHIO',
    code: 'PITD',
    trackingUrlTemplate: 'https://pittohio.com/mypittohio/Shipping/LTL/TraceRequest?proNumber={trackingNumber}',
    isActive: true,
    metadata: {
      scac: 'PITD',
      serviceType: 'LTL',
      region: 'Northeast/Midwest US',
      website: 'https://pittohio.com',
    },
  }
}
