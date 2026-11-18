import type { Carrier } from '../../../schema/carrier'

// ─── Derived carrier record ────────────────────────────────────────────────
//
// OnTrac is itself a single regional carrier (western US).  There is no
// /carriers list endpoint in the v2 REST API; the carrier identity is baked
// into the adapter.  We derive it from the platform's known metadata so that
// callers always receive a well-formed Carrier object.

export function transformCarrier(): Carrier {
  return {
    id: 'ontrac',
    name: 'OnTrac',
    code: 'ontrac',
    trackingUrlTemplate: 'https://www.ontrac.com/trackingRes.asp?trackingnum={trackingNumber}',
    services: [
      { code: 'GRND', name: 'OnTrac Ground', transitDaysMin: 1, transitDaysMax: 5, isGuaranteed: false },
      { code: 'SRVR', name: 'Sunrise', transitDaysMin: 1, transitDaysMax: 1, isGuaranteed: false },
    ],
    isActive: true,
    metadata: {
      serviceArea: ['CA', 'AZ', 'NV', 'OR', 'WA', 'UT', 'CO', 'ID'],
    },
  }
}
