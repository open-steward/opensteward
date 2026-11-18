import type { Carrier } from '../../../schema/carrier'
import type { CarrierService } from '../../../schema/shared'

/**
 * EnviaYa GET /api/v2/carrier_services/services_map ("Get all services" in the
 * Postman collection behind https://docs.enviaya.com.mx/; the request URL there
 * is localhost, the production host comes from the saved example). The saved
 * 200 example answers
 *
 *   { "services": { "FedEx": [ { "INTERNATIONAL_PRIORITY": "International Priority" }, ... ],
 *                   "UPS": [ { "07": "UPS Express" }, ..., { "": null }, ... ], ... } }
 *
 * Each key of `services` is a carrier; each single-key object under it is one
 * service, code → name. The example includes {"": null}, so a name can be null.
 */
export interface EnviaYaServicesMapResponse {
  services?: Record<string, Array<Record<string, string | null>>> | null
}

function toServices(entries: Array<Record<string, string | null>>): CarrierService[] {
  const services: CarrierService[] = []
  const seen = new Set<string>()
  for (const entry of entries) {
    for (const [code, name] of Object.entries(entry)) {
      // {"": null} names no service: CarrierService.code is required.
      if (!code) continue
      // The example repeats some code/name pairs verbatim; keep one of each.
      const key = JSON.stringify([code, name])
      if (seen.has(key)) continue
      seen.add(key)
      services.push(typeof name === 'string' ? { code, name } : { code })
    }
  }
  return services
}

/**
 * One carrier per key of the services map, in the order EnviaYa answers.
 * The key is the carrier's only identifier in the response, and it is the
 * value EnviaYa's own requests name a carrier by (the documented Tracking
 * body sends "carrier":"DHL"), so it serves as id, name and code.
 */
export function transformServicesMap(raw: EnviaYaServicesMapResponse): Carrier[] {
  return Object.entries(raw.services ?? {}).map(([carrier, entries]) => {
    const services = toServices(entries ?? [])
    return {
      id: carrier,
      name: carrier,
      code: carrier,
      ...(services.length > 0 ? { services } : {}),
    }
  })
}
