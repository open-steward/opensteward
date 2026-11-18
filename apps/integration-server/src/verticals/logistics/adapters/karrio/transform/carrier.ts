import type { Carrier } from '../../../schema/carrier'

/**
 * One of the account's carrier connections, from GET /v1/connections
 * (https://docs.karrio.io/reference/openapi, "Connections": "This is an object
 * representing your Karrio carrier connections. You can retrieve all carrier
 * connections available to your account. The carrier_id is a friendly name you
 * assign to your connection.").
 *
 * Documented `CarrierConnection` fields; `id`, `carrier_name`, `carrier_id`,
 * `active`, `is_system` and `test_mode` are required:
 *   id            "A unique carrier connection identifier"
 *   carrier_name  "A carrier connection type." (the carrier slug, e.g. `dhl_express`)
 *   display_name  "The carrier connection type verbose name."
 *   carrier_id    "A carrier connection friendly name."
 *   capabilities  "The carrier enabled capabilities."
 *   active        "The active flag indicates whether the carrier account is active or not."
 *   is_system     "The carrier connection is provided by the system admin."
 *   test_mode     "The test flag indicates whether to use a carrier configured for test."
 * The 2024.12.6 reference also returns the connection's `credentials`; they are
 * the carrier account's secrets and are never copied into the canonical row.
 *
 * Carrier.id is `carrier_id`, because that is the key every other Karrio
 * resource carries: Shipment.carrier_id "The shipment carrier configured
 * identifier", Manifest.carrier_id "The manifest carrier configured name", and
 * Rate.carrier_id "The targeted carrier's name (unique identifier)". Keying on
 * the connection `id` would leave no Shipment/Label/Manifest/Rate/TrackingEvent
 * carrierId that resolves to a Carrier. The connection `id` is kept in metadata.
 */
export interface KarrioCarrierConnection {
  id: string
  object_type?: string
  carrier_name: string
  display_name?: string | null
  carrier_id: string
  credentials?: unknown
  capabilities?: string[] | null
  config?: Record<string, unknown>
  metadata?: Record<string, unknown>
  is_system: boolean
  active: boolean
  test_mode: boolean
}

export function transformCarrier(raw: KarrioCarrierConnection): Carrier {
  return {
    id: raw.carrier_id,
    name: raw.display_name ?? undefined,
    code: raw.carrier_name,
    isActive: raw.active,
    metadata: {
      connectionId: raw.id,
      capabilities: raw.capabilities ?? undefined,
      isSystem: raw.is_system,
      testMode: raw.test_mode,
    },
  }
}
