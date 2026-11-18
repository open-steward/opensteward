import type { Manifest } from '../../../schema/manifest'
import { toISODate } from '../../shared/transform'

// ─── GLS-DE raw types ─────────────────────────────────────────────────────

export interface GlsDeEndOfDayShipmentUnit {
  TrackID: string | null
  ParcelNumber: string | null
  Weight: number | null
  [key: string]: unknown
}

export interface GlsDeEndOfDayShipment {
  ShippingDate: string | null
  Product: string | null
  Consignee: Record<string, unknown> | null
  Shipper: Record<string, unknown> | null
  ShipmentUnit: GlsDeEndOfDayShipmentUnit[] | null
  [key: string]: unknown
}

export interface GlsDeEndOfDayResponse {
  Shipments: GlsDeEndOfDayShipment[] | null
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

/**
 * Maps a GLS ShipIT End-of-Day response to the canonical Manifest.
 * The GLS ShipIT `/endofday` endpoint triggers day-close and returns all
 * affected shipments — this is the closest concept to a manifest that the
 * GLS-DE API exposes.
 *
 * Docs: POST /endofday?date=YYYY-MM-DD
 */
export function transformManifest(
  raw: GlsDeEndOfDayResponse,
  date: string,
): Manifest {
  const shipmentIds: string[] = []
  let labelCount = 0

  for (const shipment of raw.Shipments ?? []) {
    for (const unit of shipment.ShipmentUnit ?? []) {
      if (unit.TrackID) shipmentIds.push(unit.TrackID)
      labelCount += 1
    }
  }

  return {
    id: `eod-${date}`,
    carrierId: 'gls-de',
    manifestNumber: `GLS-EOD-${date}`,
    status: 'CLOSED',
    shipmentIds: shipmentIds.length > 0 ? shipmentIds : undefined,
    labelCount: labelCount > 0 ? labelCount : undefined,
    submittedAt: toISODate(date),
    createdAt: toISODate(date),
    metadata: raw as Record<string, unknown>,
  }
}
