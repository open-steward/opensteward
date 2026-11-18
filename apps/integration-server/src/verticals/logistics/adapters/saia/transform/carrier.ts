import type { Carrier } from '../../../schema/carrier'

/**
 * SAIA Freight is itself the single LTL carrier for this adapter.
 * No carrier-listing endpoint exists; this static record is derived
 * from the well-known platform identity (SCAC: SAIA).
 */
export function getSaiaCarrier(): Carrier {
  return {
    id: 'saia',
    name: 'Saia LTL Freight',
    code: 'saia',
    trackingUrlTemplate:
      'https://www.saia.com/track/results?proid={trackingNumber}',
    isActive: true,
    metadata: {
      scac: 'SAIA',
      type: 'LTL',
    },
  }
}
