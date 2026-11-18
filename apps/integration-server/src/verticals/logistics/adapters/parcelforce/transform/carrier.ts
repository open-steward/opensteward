import type { Carrier } from '../../../schema/carrier'

// ─── Parcelforce raw types ─────────────────────────────────────────────────
//
// Parcelforce has no carrier-listing REST endpoint. The platform IS a single
// carrier, so we return a static record synthesised from known constants.

export interface ParcelforceCarrierStub {
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformCarrier(_raw?: ParcelforceCarrierStub): Carrier {
  return {
    id: 'parcelforce',
    name: 'Parcelforce Worldwide',
    code: 'parcelforce',
    trackingUrlTemplate:
      'https://www.parcelforce.com/track-trace?trackNumber={trackingNumber}',
    services: [
      { code: 'express24', name: 'Express 24', isGuaranteed: true },
      { code: 'express48', name: 'Express 48', isGuaranteed: true },
      { code: 'expressam', name: 'Express AM', isGuaranteed: true },
      { code: 'expressam_sat', name: 'Express AM Saturday', isGuaranteed: false },
      { code: 'globe_express', name: 'Global Express', isGuaranteed: false },
      { code: 'euro_priority', name: 'Euro Priority', isGuaranteed: false },
    ],
    isActive: true,
    metadata: {},
  }
}
