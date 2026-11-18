import type { Carrier } from '../../../schema/carrier'

/**
 * GoSend is a single-carrier platform (Gojek's own on-demand delivery service).
 * There is no /carriers listing endpoint; the carrier record is derived statically
 * from the platform's documented service offering.
 */
export function getGojekSendCarrier(): Carrier {
  return {
    id: 'gojek-send',
    name: 'GoSend',
    code: 'gojek-send',
    trackingUrlTemplate: 'https://www.gojek.com/en-id/gosend',
    services: [
      { code: 'instant', name: 'GoSend Instant', transitDaysMin: 0, transitDaysMax: 0, isGuaranteed: false },
      { code: 'sameday', name: 'GoSend SameDay', transitDaysMin: 0, transitDaysMax: 1, isGuaranteed: false },
      { code: 'car', name: 'GoSend Car', transitDaysMin: 0, transitDaysMax: 0, isGuaranteed: false },
    ],
    isActive: true,
    metadata: { platform: 'gojek-send' },
  }
}
