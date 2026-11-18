import type { Carrier } from '../../../schema/carrier'
import type { CarrierService } from '../../../schema/shared'

// ─── SERA raw types ─────────────────────────────────────────────────────────
//
// GET /v1/carrier-services, 200 response schema, from
// https://developer.stamps.com/rest-api/reference/serav1.html:
//
//   shipping_options: array of {
//     carrier: string,
//     services: array of { service_type: string, service_name: string,
//                          packaging_options: array, ... }
//   }
//
// Only the fields this transform reads are typed; the rest travel in metadata.

export interface EndiciaCarrierServiceOption {
  service_type?: string
  service_name?: string
  [key: string]: unknown
}

export interface EndiciaCarrierShippingOption {
  carrier?: string
  services?: EndiciaCarrierServiceOption[]
  [key: string]: unknown
}

export interface EndiciaCarrierServicesResponse {
  shipping_options?: EndiciaCarrierShippingOption[]
}

// ─── Transform ──────────────────────────────────────────────────────────────

function mapService(raw: EndiciaCarrierServiceOption, carrier: string): CarrierService {
  if (!raw.service_type) {
    throw new Error(`SERA carrier-services: a ${carrier} service has no service_type`)
  }
  return {
    code: raw.service_type,
    ...(raw.service_name ? { name: raw.service_name } : {}),
  }
}

/**
 * One SERA `shipping_options` entry as a canonical carrier. `carrier` is the
 * only identifier SERA gives a shipping option, so it is the id and code; the
 * docs give no display name, so none is set.
 */
export function transformCarrier(raw: EndiciaCarrierShippingOption): Carrier {
  if (!raw.carrier) {
    throw new Error('SERA carrier-services: a shipping option has no carrier')
  }
  const carrier = raw.carrier
  return {
    id: carrier,
    code: carrier,
    services: (raw.services ?? []).map((s) => mapService(s, carrier)),
    metadata: raw as Record<string, unknown>,
  }
}
