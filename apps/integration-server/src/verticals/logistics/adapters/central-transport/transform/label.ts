/**
 * Central Transport label transforms.
 *
 * Piyovi does not expose a dedicated label resource or list endpoint.
 * Label data (BOL / carrier label) is returned inline in the response
 * to POST /v1/shipment (create shipment).  This transform derives a
 * canonical Label from that same PiyoviShipmentResponse so callers can
 * surface label metadata (URL, tracking number, status) after shipment
 * creation without a second API call.
 *
 * Derived from: PiyoviShipmentResponse (POST /v1/shipment).
 */
import type { Label } from '../../../schema/label'
import type { PiyoviShipmentResponse } from './shipment'
import { toISODate } from '../../shared/transform'

// ─── Transform ───────────────────────────────────────────────────────────────

export function transformLabel(raw: PiyoviShipmentResponse): Label {
  const shipmentId = raw.shipmentId ?? raw.id ?? raw.activityId ?? undefined
  const trackingNumber = raw.proNumber ?? raw.trackingNumber ?? undefined
  const createdAt = toISODate(raw.createdAt ?? raw.createdDate)

  // Piyovi returns both a carrier label URL and a BOL URL; prefer the BOL
  // for LTL shipments (Central Transport is an LTL carrier), but fall back
  // to the generic label URL when the BOL URL is absent.
  const url = raw.bolUrl ?? raw.labelUrl ?? undefined

  // Piyovi serves documents as PDFs.
  const format = url ? ('PDF' as const) : undefined

  return {
    id: shipmentId,
    shipmentId,
    trackingNumber,
    carrierId: 'central-transport',
    serviceCode: raw.serviceCode ?? undefined,
    format,
    status: 'CREATED' as const,
    url,
    createdAt: createdAt ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
