import type { Carrier } from '../../../schema/carrier'

/**
 * ShipBob shipping method → canonical Carrier.
 *
 * ShipBob does not expose carriers. It is a 3PL: the merchant picks a SERVICE
 * LEVEL ("Standard", "2-Day") and ShipBob chooses the actual carrier per
 * shipment, at fulfilment time, from its own contracts. There is no
 * `/carrier` endpoint — probed and 404 — and the carrier only becomes known
 * once a shipment ships, on the shipment's `tracking` object.
 *
 * `GET /shipping-method` is the nearest real thing and what this maps:
 *
 *     { "id": 236457, "active": true, "default": true,
 *       "name": "ShipBob Default",
 *       "service_level": { "id": 3, "name": "Standard" } }
 *
 * So a row here is a shipping method, presented through the Carrier shape
 * because that is where a caller looks for "what delivery options exist". The
 * distinction is preserved rather than hidden: `name` is the method, the
 * service level is the single entry in `services`, and the raw payload stays
 * in `metadata`.
 */
export interface ShipBobShippingMethod {
  id: number
  name?: string | null
  active?: boolean | null
  default?: boolean | null
  service_level?: { id?: number | null; name?: string | null } | null
  [key: string]: unknown
}

export function transformCarrier(raw: ShipBobShippingMethod): Carrier {
  const level = raw.service_level ?? undefined
  // `code` is required on CarrierService, so a level with no name contributes
  // no entry rather than an entry keyed on an empty string.
  const serviceCode = level?.id != null ? String(level.id) : undefined

  return {
    id: String(raw.id),
    name: raw.name ?? undefined,
    // ShipBob has no carrier code of its own. The method id is the only stable
    // handle, and it is what `ship_option` on a shipment refers back to.
    code: String(raw.id),
    ...(serviceCode
      ? {
          services: [
            {
              code: serviceCode,
              ...(level?.name ? { name: level.name } : {}),
            },
          ],
        }
      : {}),
    isActive: raw.active ?? undefined,
    metadata: raw,
  }
}
