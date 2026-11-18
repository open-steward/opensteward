import type { Carrier } from '../../../schema/carrier'

// ─── Derived carrier record ────────────────────────────────────────────────
//
// Spee-Dee is itself a single regional carrier (Midwest US).  There is no
// /carriers list endpoint in the Spee-Dee REST API; the carrier identity is
// baked into the adapter.  We derive it from the platform's known metadata so
// that callers always receive a well-formed Carrier object.
//
// Service area: IL, IA, MN, ND, SD, WI, and select ZIP codes in KS, MI, MO, NE.
// EasyPost reports a single service level "SpeeDeeDelivery" for Midwest ground.

export function transformCarrier(): Carrier {
  return {
    id: 'spee-dee',
    name: 'Spee-Dee Delivery',
    code: 'spee-dee',
    trackingUrlTemplate: 'https://speedeedelivery.com/track-a-shipment/?trackingNumber={trackingNumber}',
    services: [
      {
        code: 'SpeeDeeDelivery',
        name: 'Spee-Dee Ground',
        transitDaysMin: 1,
        transitDaysMax: 3,
        isGuaranteed: false,
      },
    ],
    isActive: true,
    metadata: {
      serviceArea: ['IL', 'IA', 'MN', 'ND', 'SD', 'WI', 'KS', 'MI', 'MO', 'NE'],
    },
  }
}
