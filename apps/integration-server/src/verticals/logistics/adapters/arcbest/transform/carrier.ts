import type { Carrier } from '../../../schema/carrier'

/**
 * ArcBest (ABF Freight) is itself the carrier.
 * The platform exposes no carrier-listing endpoint; this static record
 * is derived from the well-known identity of the platform.
 */
export function getArcbestCarrier(): Carrier {
  return {
    id: 'arcbest',
    name: 'ArcBest (ABF Freight)',
    code: 'arcbest',
    trackingUrlTemplate:
      'https://arcb.com/tools/tracking.html#{trackingNumber}',
    isActive: true,
    metadata: {
      scac: 'ABFS',
      type: 'LTL',
    },
  }
}
