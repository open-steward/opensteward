/**
 * Metapack — Carrier transform.
 *
 * Shipping API 1.14.0 (https://dev.metapack.com/shipping/reference/shipping/operation/getAccountCarriers/):
 *   GET /carriers, "Retrieve all carriers associated with your Metapack shipper
 *   account." 200: an array of `Carrier` { name: string, code: string }.
 *   GET /carriers/{carrierCode}/services, "Retrieve all carrier services
 *   associated with your Metapack shipper account." 200: an array of
 *   `CarrierService1` { name: string, code: string }.
 *
 * Neither schema carries anything else, so the canonical carrier holds the
 * code (also its id, the `carrierCode` the services path takes), the name and
 * the services.
 */

import type { Carrier } from '../../../schema/carrier'
import type { CarrierService } from '../../../schema/shared'

export interface MetapackCarrier {
  name?: string
  code?: string
}

export interface MetapackCarrierService {
  name?: string
  code?: string
}

/** Services without a code are dropped: the canonical service requires one. */
function mapServices(services: readonly MetapackCarrierService[]): CarrierService[] {
  return services
    .filter(
      (s): s is MetapackCarrierService & { code: string } =>
        typeof s.code === 'string' && s.code !== '',
    )
    .map((s) => ({ code: s.code, name: s.name }))
}

export function transformCarrier(
  raw: MetapackCarrier,
  services?: readonly MetapackCarrierService[],
): Carrier {
  return {
    id: raw.code,
    code: raw.code,
    name: raw.name,
    services: services ? mapServices(services) : undefined,
    metadata: { ...raw },
  }
}
