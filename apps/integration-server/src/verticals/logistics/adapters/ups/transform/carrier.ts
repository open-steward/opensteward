import type { Carrier } from '../../../schema/carrier'
import type { CarrierService } from '../../../schema/shared'
import { UPS_SERVICE_CODES } from '../constants'

/**
 * UPS is the carrier itself.  There is no "list carriers" or "get carrier"
 * REST endpoint in the UPS REST API — UPS is always the sole carrier.
 * We derive a static Carrier record from the well-known UPS service codes
 * already defined in constants.ts.
 */

const UPS_SERVICES: CarrierService[] = [
  { code: '01', name: UPS_SERVICE_CODES['01'], transitDaysMin: 1, transitDaysMax: 1, isGuaranteed: true },
  { code: '02', name: UPS_SERVICE_CODES['02'], transitDaysMin: 2, transitDaysMax: 2, isGuaranteed: true },
  { code: '03', name: UPS_SERVICE_CODES['03'], transitDaysMin: 1, transitDaysMax: 5, isGuaranteed: false },
  { code: '07', name: UPS_SERVICE_CODES['07'], transitDaysMin: 1, transitDaysMax: 3, isGuaranteed: true },
  { code: '08', name: UPS_SERVICE_CODES['08'], transitDaysMin: 2, transitDaysMax: 5, isGuaranteed: false },
  { code: '11', name: UPS_SERVICE_CODES['11'], transitDaysMin: 1, transitDaysMax: 5, isGuaranteed: false },
  { code: '12', name: UPS_SERVICE_CODES['12'], transitDaysMin: 3, transitDaysMax: 3, isGuaranteed: true },
  { code: '13', name: UPS_SERVICE_CODES['13'], transitDaysMin: 1, transitDaysMax: 1, isGuaranteed: true },
  { code: '14', name: UPS_SERVICE_CODES['14'], transitDaysMin: 1, transitDaysMax: 1, isGuaranteed: true },
  { code: '54', name: UPS_SERVICE_CODES['54'], transitDaysMin: 1, transitDaysMax: 2, isGuaranteed: true },
  { code: '65', name: UPS_SERVICE_CODES['65'], transitDaysMin: 1, transitDaysMax: 3, isGuaranteed: true },
]

/**
 * Returns the static UPS carrier record.
 * Derived from publicly documented UPS service codes — no API call needed.
 */
export function getUPSCarrier(): Carrier {
  return {
    id: 'ups',
    name: 'UPS',
    code: 'ups',
    trackingUrlTemplate: 'https://www.ups.com/track?tracknum={trackingNumber}',
    services: UPS_SERVICES,
    isActive: true,
  }
}
