import type { Carrier } from '../../../schema/carrier'

/**
 * R+L Carriers is itself the single carrier entity.
 * The R+L API has no /Carrier listing endpoint — the carrier identity is static
 * and derived from the platform constants.
 *
 * Derived from: known platform metadata (carrier code, tracking URL pattern)
 * as confirmed by the R+L Carriers developer portal at technology.rlcarriers.com.
 */

export const RL_CARRIERS_STATIC_CARRIER: Carrier = {
  id: 'rl-carriers',
  name: 'R+L Carriers',
  code: 'RLCA',
  trackingUrlTemplate: 'https://www.rlcarriers.com/freight/shipping/shipment-tracing?proNumber={trackingNumber}',
  services: [
    {
      code: 'LTL',
      name: 'Standard LTL',
      isGuaranteed: false,
    },
    {
      code: 'GUARANTEED',
      name: 'R+L Carriers Guaranteed',
      isGuaranteed: true,
    },
    {
      code: 'EXPEDITED',
      name: 'R+L Carriers Expedited',
      isGuaranteed: false,
    },
  ],
  isActive: true,
}

export function transformCarrier(): Carrier {
  return RL_CARRIERS_STATIC_CARRIER
}
