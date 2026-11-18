import type { Carrier } from '../../../schema/carrier'
import type { CarrierService } from '../../../schema/shared'

/**
 * 3PL Warehouse Manager `GET /properties/carriers`.
 *
 * First-party source: the 3PL Central REST APIs Postman collection
 * (https://developer.3plcentral.com/api/collections/8399762/SVn3tFsv), request
 * "Carriers, services, and billing options":
 *   "Returns a list of all carriers and the services (under shipmentServices)
 *    and billing options (under billingCodes) associated with them. If the
 *    services or billing options sections for a carrier is empty it will use
 *    the values under defaultShipmentServices and defaultBillingCodes
 *    respectively."
 *
 * The documented example response is a HAL object:
 *   { defaultBillingCodes, defaultShipmentServices, _links,
 *     _embedded: { "http://api.3plCentral.com/rels/properties/carrier": [
 *       { name, description, needsBillOfLading, scacCode, deactivated,
 *         disallowOnOrder, shipmentServices: [{ code, description,
 *         shipEngineId }], _links: { self: { href: "/properties/carriers/APC" } } } ] } }
 */
export const CARRIER_REL = 'http://api.3plCentral.com/rels/properties/carrier'

export interface ExtensivShipmentService {
  code: string
  description?: string | null
  shipEngineId?: string | null
  [key: string]: unknown
}

export interface ExtensivCarrier {
  name?: string | null
  description?: string | null
  needsBillOfLading?: boolean | null
  scacCode?: string | null
  deactivated?: boolean | null
  disallowOnOrder?: boolean | null
  shipmentServices?: ExtensivShipmentService[] | null
  [key: string]: unknown
}

export interface ExtensivCarriersResponse {
  defaultBillingCodes?: unknown
  defaultShipmentServices?: ExtensivShipmentService[] | null
  _embedded?: { [CARRIER_REL]?: ExtensivCarrier[] | null } | null
  [key: string]: unknown
}

const nonEmpty = (v: string | null | undefined): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v : undefined

function toServices(
  services: ExtensivShipmentService[] | null | undefined,
): CarrierService[] | undefined {
  if (!services || services.length === 0) return undefined
  return services.map((svc) => ({
    code: svc.code,
    name: nonEmpty(svc.description),
  }))
}

/**
 * One embedded carrier. `name` is the key of the documented
 * `/properties/carriers/{name}` link, so it is the id; `description` is the
 * display name ("FedEx" is "Federal Express"). A carrier with no
 * services of its own uses the response's `defaultShipmentServices`, as the
 * docs say.
 */
export function transformCarrier(
  raw: ExtensivCarrier,
  defaultServices?: ExtensivShipmentService[] | null,
): Carrier {
  const own = raw.shipmentServices && raw.shipmentServices.length > 0
  return {
    id: nonEmpty(raw.name),
    name: nonEmpty(raw.description),
    code: nonEmpty(raw.scacCode),
    services: toServices(own ? raw.shipmentServices : defaultServices),
    isActive: typeof raw.deactivated === 'boolean' ? !raw.deactivated : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

/** Every carrier in one `GET /properties/carriers` response. */
export function transformCarriers(res: ExtensivCarriersResponse | null | undefined): Carrier[] {
  const rows = res?._embedded?.[CARRIER_REL] ?? []
  return rows.map((row) => transformCarrier(row, res?.defaultShipmentServices))
}
