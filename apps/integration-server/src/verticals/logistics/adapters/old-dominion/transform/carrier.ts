import type { Carrier } from '../../../schema/carrier'

/**
 * ODFL is itself the single LTL carrier.  There is no /carriers list endpoint
 * in the REST API, so this adapter surfaces a static carrier record derived
 * from the platform constants.
 */
export function transformCarrier(): Carrier {
  return {
    id: 'old-dominion',
    name: 'Old Dominion Freight Line',
    code: 'ODFL',
    trackingUrlTemplate: 'https://www.odfl.com/us/en/tools/tracking.html?proNumber={trackingNumber}',
    services: [
      { code: 'OD_STANDARD', name: 'OD Standard LTL' },
      { code: 'OD_GUARANTEED', name: 'OD Guaranteed', isGuaranteed: true },
      { code: 'OD_GUARANTEED_EARLY', name: 'OD Guaranteed Early AM', isGuaranteed: true },
    ],
    isActive: true,
    metadata: { platform: 'old-dominion' },
  }
}
