import type { Carrier } from '../../../schema/carrier'
import type { CarrierService } from '../../../schema/shared'

/**
 * FedEx is the carrier itself.  There is no "list carriers" or "get carrier"
 * REST endpoint on apis.fedex.com — FedEx is always the sole carrier.
 * We derive a static Carrier record from known FedEx service codes.
 */

const FEDEX_SERVICES: CarrierService[] = [
  { code: 'FEDEX_GROUND', name: 'FedEx Ground', transitDaysMin: 1, transitDaysMax: 5, isGuaranteed: false },
  { code: 'FEDEX_2_DAY', name: 'FedEx 2Day', transitDaysMin: 2, transitDaysMax: 2, isGuaranteed: true },
  { code: 'FEDEX_2_DAY_AM', name: 'FedEx 2Day A.M.', transitDaysMin: 2, transitDaysMax: 2, isGuaranteed: true },
  { code: 'FEDEX_EXPRESS_SAVER', name: 'FedEx Express Saver', transitDaysMin: 3, transitDaysMax: 3, isGuaranteed: true },
  { code: 'STANDARD_OVERNIGHT', name: 'FedEx Standard Overnight', transitDaysMin: 1, transitDaysMax: 1, isGuaranteed: true },
  { code: 'PRIORITY_OVERNIGHT', name: 'FedEx Priority Overnight', transitDaysMin: 1, transitDaysMax: 1, isGuaranteed: true },
  { code: 'FIRST_OVERNIGHT', name: 'FedEx First Overnight', transitDaysMin: 1, transitDaysMax: 1, isGuaranteed: true },
  { code: 'INTERNATIONAL_ECONOMY', name: 'FedEx International Economy', transitDaysMin: 2, transitDaysMax: 5, isGuaranteed: false },
  { code: 'INTERNATIONAL_PRIORITY', name: 'FedEx International Priority', transitDaysMin: 1, transitDaysMax: 3, isGuaranteed: true },
  { code: 'GROUND_HOME_DELIVERY', name: 'FedEx Home Delivery', transitDaysMin: 1, transitDaysMax: 5, isGuaranteed: false },
  { code: 'SMART_POST', name: 'FedEx Ground Economy', transitDaysMin: 2, transitDaysMax: 7, isGuaranteed: false },
]

/**
 * Returns the static FedEx carrier record.
 * Derived from publicly documented FedEx service codes — no API call needed.
 */
export function getFedExCarrier(): Carrier {
  return {
    id: 'fedex',
    name: 'FedEx',
    code: 'fedex',
    trackingUrlTemplate: 'https://www.fedex.com/fedextrack/?tracknumbers={trackingNumber}',
    services: FEDEX_SERVICES,
    isActive: true,
  }
}
