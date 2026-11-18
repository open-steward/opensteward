/**
 * Shipway REST API — /api/carriers response → canonical Carrier.
 *
 * GET https://shipway.in/api/carriers
 * Response: { status: "success", couriers: [{ id, courier_name, image }] }
 *
 * Docs: https://shipway.in/plugins/shipway-order-tracking-notify/Shipway_Docs_for_client_v_1.3.pdf
 */
import type { Carrier } from '../../../schema/carrier'

// ─── Shipway raw types ─────────────────────────────────────────────────────

export interface ShipwayCourierRaw {
  id?: string | null
  courier_name?: string | null
  image?: string | null
  [key: string]: unknown
}

export interface ShipwayCarriersResponse {
  status?: string | null
  couriers?: ShipwayCourierRaw[]
  [key: string]: unknown
}

// ─── Transform ─────────────────────────────────────────────────────────────

export function transformCarrier(raw: ShipwayCourierRaw): Carrier {
  const id = raw.id != null ? String(raw.id) : undefined
  return {
    id,
    name: raw.courier_name ?? undefined,
    code: id,
    isActive: true,
    metadata: raw as Record<string, unknown>,
  }
}
