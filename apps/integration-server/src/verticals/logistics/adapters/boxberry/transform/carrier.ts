import type { Carrier } from '../../../schema/carrier'

/**
 * Boxberry is itself the carrier — there is no carrier-list endpoint in the
 * Boxberry API.  We derive a single static Carrier descriptor from the
 * platform identity.
 *
 * Reference: https://boxberry.ru (Boxberry logistics platform)
 */
export function transformSelfCarrier(): Carrier {
  return {
    id: 'boxberry',
    name: 'Boxberry',
    code: 'boxberry',
    trackingUrlTemplate: 'https://boxberry.ru/tracking/?id={trackingNumber}',
    isActive: true,
    metadata: { platform: 'boxberry' },
  }
}
