import type { Carrier } from '../../../schema/carrier'

/**
 * One connection of a carrier in ShippyPro's `GetCarriers` response.
 *
 * https://api.shippypro.com/docs/v1.json, `GetCarriersResponse`:
 *   "Carriers": { "type": "object", "description": "List of carriers. The key is the carrier name.",
 *     "additionalProperties": { "type": "array", "description": "List of connections for that carrier.",
 *       "items": { "properties": { "CarrierID": {"type":"string","example":"10"},
 *         "CarrierService": {"type":"string","example":"NextDayAir"},
 *         "ServicesList": {"type":"array","description":"Carrier services.","items":{"type":"string"}},
 *         "Label": {"type":"string","example":"UPS"} } } } }
 */
export interface ShippyProCarrierConnection {
  CarrierID?: string | null
  CarrierService?: string | null
  ServicesList?: string[] | null
  Label?: string | null
  [key: string]: unknown
}

/** `GetCarriersResponse`: connections grouped under their carrier name. */
export interface ShippyProCarriersResponse {
  Carriers?: Record<string, ShippyProCarrierConnection[] | null> | null
}

/**
 * One Carrier per connected carrier account. `id` is the documented
 * `CarrierID` ("Get **CarrierID** and other carrier details to use in API
 * calls"), which is also what `GetOrder` returns as `CarrierID`; `code` is the
 * carrier name the connection is listed under.
 */
export function transformCarrier(carrierName: string, raw: ShippyProCarrierConnection): Carrier {
  const services = (raw.ServicesList ?? []).map((code) => ({ code }))
  return {
    id: raw.CarrierID ?? undefined,
    name: raw.Label ?? undefined,
    code: carrierName,
    services: services.length > 0 ? services : undefined,
    metadata: { carrierName, ...raw },
  }
}

/** Every connection of every carrier, in response order. */
export function transformCarriers(res: ShippyProCarriersResponse): Carrier[] {
  return Object.entries(res.Carriers ?? {}).flatMap(([name, connections]) =>
    (connections ?? []).map((c) => transformCarrier(name, c)),
  )
}
